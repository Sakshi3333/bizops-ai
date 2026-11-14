"""Renders an invoice as a printable A4 PDF.

Kept separate from the router so other features (e.g. emailing an invoice)
can reuse it. Amounts are prefixed with the currency *code* rather than a
symbol because ReportLab's built-in fonts have no glyph for e.g. the rupee sign.
"""

from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models.company import Company
from app.models.customer import Customer
from app.models.invoice import Invoice

ACCENT = colors.HexColor("#1f4e79")
MUTED = colors.HexColor("#6b7280")
RULE = colors.HexColor("#d1d5db")


def _money(amount: Decimal, currency: str) -> str:
    return f"{currency} {amount:,.2f}"


def render_invoice_pdf(invoice: Invoice, company: Company, customer: Customer) -> bytes:
    styles = getSampleStyleSheet()
    normal = styles["Normal"]
    muted = ParagraphStyle("muted", parent=normal, textColor=MUTED, fontSize=9, leading=12)
    heading = ParagraphStyle("heading", parent=normal, fontName="Helvetica-Bold", fontSize=18, leading=24, textColor=ACCENT)
    title = ParagraphStyle("title", parent=heading, alignment=TA_RIGHT, fontSize=22, leading=28)
    right = ParagraphStyle("right", parent=normal, alignment=TA_RIGHT)
    currency = company.currency

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"Invoice {invoice.number}",
        author=company.name,
    )
    width = doc.width
    story = []

    # Header: company on the left, invoice title + number on the right.
    header = Table(
        [
            [Paragraph(escape(company.name), heading), Paragraph("INVOICE", title)],
            [Paragraph(escape(company.email), muted), Paragraph(invoice.number, right)],
        ],
        colWidths=[width * 0.6, width * 0.4],
    )
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [header, Spacer(1, 10 * mm)]

    # Bill-to block and invoice dates.
    bill_to_lines = [f"<b>{escape(customer.name)}</b>"]
    bill_to_lines += [escape(line) for line in (customer.address, customer.email, customer.phone) if line]
    meta = Table(
        [
            ["Issue date", invoice.issue_date.strftime("%d %b %Y")],
            ["Due date", invoice.due_date.strftime("%d %b %Y")],
            ["Status", invoice.status.value.title()],
        ],
        colWidths=[width * 0.18, width * 0.22],
    )
    meta.setStyle(TableStyle([
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    parties = Table(
        [[
            [Paragraph("BILL TO", muted), Paragraph("<br/>".join(bill_to_lines), normal)],
            meta,
        ]],
        colWidths=[width * 0.6, width * 0.4],
    )
    parties.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [parties, Spacer(1, 10 * mm)]

    # Line items.
    rows = [["#", "Description", "Qty", "Unit price", "Amount"]]
    for index, item in enumerate(invoice.items, start=1):
        rows.append([
            str(index),
            Paragraph(escape(item.description), normal),
            str(item.quantity),
            _money(item.unit_price, currency),
            _money(item.line_total, currency),
        ])
    items_table = Table(
        rows,
        colWidths=[width * 0.06, width * 0.44, width * 0.1, width * 0.2, width * 0.2],
        repeatRows=1,
    )
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story += [items_table, Spacer(1, 6 * mm)]

    # Totals, right-aligned under the amount column.
    totals = Table(
        [
            ["Subtotal", _money(invoice.subtotal, currency)],
            [f"Tax ({invoice.tax_percent.normalize():f}%)", _money(invoice.tax_amount, currency)],
            ["Total", _money(invoice.total, currency)],
        ],
        colWidths=[width * 0.2, width * 0.2],
        hAlign="RIGHT",
    )
    totals.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, 1), MUTED),
        ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("FONTSIZE", (0, 2), (-1, 2), 11),
        ("LINEABOVE", (0, 2), (-1, 2), 1, ACCENT),
        ("TOPPADDING", (0, 2), (-1, 2), 6),
    ]))
    story.append(totals)

    if invoice.notes:
        story += [Spacer(1, 10 * mm), Paragraph("NOTES", muted), Paragraph(escape(invoice.notes).replace("\n", "<br/>"), normal)]

    story += [Spacer(1, 14 * mm), Paragraph(f"Thank you for your business. Please pay by {invoice.due_date.strftime('%d %b %Y')}.", muted)]

    doc.build(story)
    return buffer.getvalue()
