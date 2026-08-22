from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class ToolCallSummary(BaseModel):
    tool: str
    summary: str


class AskResponse(BaseModel):
    answer: str
    tools_used: list[ToolCallSummary]
