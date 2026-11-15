"""Renders an invoice as a printable A4 PDF - a GST tax invoice when the
company is GST-registered, a plain invoice otherwise.

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
from app.services.gst import rupees_in_words, state_name

ACCENT = colors.HexColor("#1f4e79")
MUTED = colors.HexColor("#6b7280")
RULE = colors.HexColor("#d1d5db")


def _money(amount: Decimal, currency: str) -> str:
    return f"{currency} {amount:,.2f}"


def _percent(rate: Decimal) -> str:
    return f"{rate.normalize():f}%"


def _state(code: str) -> str:
    return f"{state_name(code) or 'State'} ({code})"


def _tax_rows(invoice: Invoice, tax_label: str, currency: str) -> list[list[str]]:
    """The tax lines of the totals block. Rates are only named when every line
    shares one; a mixed-rate invoice shows them per line in the items table."""
    rates = {item.tax_percent if item.tax_percent is not None else invoice.tax_percent for item in invoice.items}
    rate = rates.pop() if len(rates) == 1 else None

    def label(name: str, share: int = 1) -> str:
        return f"{name} ({_percent(rate / share)})" if rate is not None else name

    if invoice.igst_amount:
        return [[label("IGST"), _money(invoice.igst_amount, currency)]]
    if invoice.cgst_amount or invoice.sgst_amount:
        return [
            [label("CGST", 2), _money(invoice.cgst_amount, currency)],
            [label("SGST", 2), _money(invoice.sgst_amount, currency)],
        ]
    return [[label(tax_label), _money(invoice.tax_amount, currency)]]


def render_invoice_pdf(invoice: Invoice, company: Company, customer: Customer) -> bytes:
    styles = getSampleStyleSheet()
    normal = styles["Normal"]
    muted = ParagraphStyle("muted", parent=normal, textColor=MUTED, fontSize=9, leading=12)
    heading = ParagraphStyle("heading", parent=normal, fontName="Helvetica-Bold", fontSize=18, leading=24, textColor=ACCENT)
    title = ParagraphStyle("title", parent=heading, alignment=TA_RIGHT, fontSize=22, leading=28)
    right = ParagraphStyle("right", parent=normal, alignment=TA_RIGHT)
    right_muted = ParagraphStyle("right_muted", parent=muted, alignment=TA_RIGHT)
    small = ParagraphStyle("small", parent=normal, fontSize=9, leading=12)
    currency = company.currency
    registered = bool(company.gstin)
    tax_label = "GST" if registered else "Tax"

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
    company_lines = [escape(line).replace("\n", "<br/>") for line in (company.address, company.email) if line]
    if registered:
        company_lines.append(f"GSTIN: {company.gstin}")
        company_lines.append(f"State: {_state(company.state_code)}")
    header = Table(
        [
            [Paragraph(escape(company.name), heading), Paragraph("TAX INVOICE" if registered else "INVOICE", title)],
            [Paragraph("<br/>".join(company_lines), muted), Paragraph(invoice.number, right)],
        ],
        colWidths=[width * 0.6, width * 0.4],
    )
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [header, Spacer(1, 10 * mm)]

    # Bill-to block and invoice dates.
    bill_to_lines = [f"<b>{escape(customer.name)}</b>"]
    bill_to_lines += [escape(line) for line in (customer.address, customer.email, customer.phone) if line]
    if customer.gstin:
        bill_to_lines.append(f"GSTIN: {customer.gstin}")
    if customer.state_code:
        bill_to_lines.append(f"State: {_state(customer.state_code)}")
    meta_rows = [
        ["Issue date", invoice.issue_date.strftime("%d %b %Y")],
        ["Due date", invoice.due_date.strftime("%d %b %Y")],
        ["Status", invoice.status.value.title()],
    ]
    if invoice.place_of_supply:
        meta_rows.append(["Place of supply", _state(invoice.place_of_supply)])
    meta = Table(meta_rows, colWidths=[width * 0.16, width * 0.24])
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

    # Line items. Amounts here carry no currency prefix - eight columns leave no room for it.
    rows = [["#", "Description", "HSN/SAC", "Qty", "Unit price", "Taxable value", f"{tax_label} %", tax_label]]
    for index, item in enumerate(invoice.items, start=1):
        rate = item.tax_percent if item.tax_percent is not None else invoice.tax_percent
        rows.append([
            str(index),
            Paragraph(escape(item.description), small),
            item.hsn_code or "-",
            str(item.quantity),
            f"{item.unit_price:,.2f}",
            f"{item.line_total:,.2f}",
            _percent(rate),
            f"{item.tax_amount:,.2f}",
        ])
    items_table = Table(
        rows,
        colWidths=[width * f for f in (0.05, 0.31, 0.1, 0.06, 0.13, 0.14, 0.08, 0.13)],
        repeatRows=1,
    )
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story += [items_table, Spacer(1, 6 * mm)]

    # Totals, right-aligned under the amount column.
    totals = Table(
        [
            ["Taxable value" if registered else "Subtotal", _money(invoice.subtotal, currency)],
            *_tax_rows(invoice, tax_label, currency),
            ["Total", _money(invoice.total, currency)],
        ],
        colWidths=[width * 0.2, width * 0.2],
        hAlign="RIGHT",
    )
    totals.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -2), MUTED),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, -1), (-1, -1), 11),
        ("LINEABOVE", (0, -1), (-1, -1), 1, ACCENT),
        ("TOPPADDING", (0, -1), (-1, -1), 6),
    ]))
    story.append(totals)

    if currency == "INR":
        story += [Spacer(1, 4 * mm), Paragraph(f"Amount in words: {rupees_in_words(invoice.total)}", right_muted)]

    if invoice.notes:
        story += [Spacer(1, 10 * mm), Paragraph("NOTES", muted), Paragraph(escape(invoice.notes).replace("\n", "<br/>"), normal)]

    story += [Spacer(1, 14 * mm), Paragraph(f"Thank you for your business. Please pay by {invoice.due_date.strftime('%d %b %Y')}.", muted)]

    doc.build(story)
    return buffer.getvalue()
