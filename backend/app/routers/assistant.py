import json
from dataclasses import asdict, is_dataclass
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from google import genai
from google.genai import types
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.assistant import AskRequest, AskResponse, ToolCallSummary
from app.services import customer_service, dashboard_service

router = APIRouter(prefix="/assistant", tags=["assistant"])

MODEL = "gemini-3.6-flash"
MAX_TOOL_ROUNDS = 5

SYSTEM_PROMPT = (
    "You are a business assistant embedded in a small business's operations "
    "platform. Answer the user's question using ONLY the tools provided - "
    "never invent or estimate a number that a tool didn't return. If a tool "
    "returns no data, say so plainly rather than guessing. Be concise: a "
    "short paragraph or a short list, not a report. Amounts are in the "
    "company's own currency; state figures plainly without assuming a "
    "currency symbol."
)

# Every tool here is read-only and takes no tenant/company identifier at
# all - each is a thin wrapper over a service function that is already
# scoped by the ambient tenant context (see core/tenant.py). There is no
# parameter through which the model (or a crafted question) could ask for
# another company's data.
_TOOL_SCHEMAS = [
    {
        "name": "get_revenue_summary",
        "description": (
            "Get revenue collected this month vs last month (based on when "
            "invoices were paid), plus the current outstanding total (sent, "
            "unpaid invoices) and overdue total (sent, unpaid, past due date)."
        ),
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "list_overdue_invoices",
        "description": (
            "List every invoice that has been sent but not paid, and is now "
            "past its due date - i.e. which customers haven't paid on time."
        ),
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "list_top_customers",
        "description": "List the top customers ranked by total amount billed (sent + paid invoices).",
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 20,
                    "description": "How many customers to return. Defaults to 5.",
                }
            },
        },
    },
    {
        "name": "list_low_stock_products",
        "description": "List products whose current stock quantity is below their reorder level.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "search_customers",
        "description": "Search the company's customers by (partial, case-insensitive) name.",
        "parameters": {
            "type": "object",
            "properties": {"name": {"type": "string", "description": "Name or partial name to search for"}},
            "required": ["name"],
        },
    },
]

TOOLS = [
    types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name=schema["name"],
                description=schema["description"],
                parameters_json_schema=schema["parameters"],
            )
            for schema in _TOOL_SCHEMAS
        ]
    )
]


def _json_default(value):
    if isinstance(value, Decimal):
        return str(value)
    if is_dataclass(value) and not isinstance(value, type):
        return asdict(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _to_plain(value) -> object:
    """Round-trip through JSON so dataclasses/Decimal/date become plain
    dict/list/str - the only shapes the Gemini SDK's function-response
    Struct will accept."""
    return json.loads(json.dumps(value, default=_json_default))


def _execute_tool(name: str, tool_input: dict, db: Session) -> tuple[object, str]:
    if name == "get_revenue_summary":
        result = dashboard_service.get_revenue_summary(db)
        return result, "Looked up revenue summary"

    if name == "list_overdue_invoices":
        result = dashboard_service.list_overdue_invoices(db)
        return result, f"Found {len(result)} overdue invoice(s)"

    if name == "list_top_customers":
        limit = tool_input.get("limit") or 5
        result = dashboard_service.list_top_customers(db, limit=limit)
        return result, f"Looked up top {len(result)} customer(s) by revenue"

    if name == "list_low_stock_products":
        result = dashboard_service.list_low_stock_products(db)
        return result, f"Found {len(result)} low-stock product(s)"

    if name == "search_customers":
        name_query = tool_input.get("name", "")
        rows = customer_service.search_customers_by_name(db, name_query)
        result = [
            {"id": str(c.id), "name": c.name, "email": c.email, "phone": c.phone} for c in rows
        ]
        return result, f"Searched customers for '{name_query}', found {len(result)}"

    raise ValueError(f"Unknown tool: {name}")


@router.post("/ask", response_model=AskResponse)
def ask_assistant(
    payload: AskRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AskResponse:
    if not settings.gemini_api_key:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "AI assistant is not configured (missing GEMINI_API_KEY)"
        )

    client = genai.Client(api_key=settings.gemini_api_key)
    config = types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT, tools=TOOLS)

    contents: list[types.Content] = [types.Content(role="user", parts=[types.Part(text=payload.question)])]
    tools_used: list[ToolCallSummary] = []

    for _ in range(MAX_TOOL_ROUNDS):
        try:
            response = client.models.generate_content(model=MODEL, contents=contents, config=config)
        except Exception as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"AI assistant error: {exc}")

        function_calls = response.function_calls
        if not function_calls:
            final_text = (response.text or "").strip()
            return AskResponse(
                answer=final_text or "I wasn't able to come up with an answer to that.",
                tools_used=tools_used,
            )

        contents.append(response.candidates[0].content)

        function_response_parts = []
        for call in function_calls:
            try:
                result, summary = _execute_tool(call.name, dict(call.args or {}), db)
                tools_used.append(ToolCallSummary(tool=call.name, summary=summary))
                function_response_parts.append(
                    types.Part.from_function_response(
                        name=call.name, response={"result": _to_plain(result)}
                    )
                )
            except Exception as exc:
                function_response_parts.append(
                    types.Part.from_function_response(name=call.name, response={"error": str(exc)})
                )
        contents.append(types.Content(role="user", parts=function_response_parts))

    raise HTTPException(
        status.HTTP_504_GATEWAY_TIMEOUT,
        "The assistant took too many steps to answer that - try rephrasing your question.",
    )
