from decimal import ROUND_HALF_UP, Decimal

from app.models.company import Company
from app.models.invoice import Invoice
from app.services.gst import line_tax


def is_interstate(invoice: Invoice, company: Company) -> bool:
    """IGST applies when a GST-registered company supplies into another state."""
    return bool(
        company.gstin and invoice.place_of_supply and invoice.place_of_supply != company.state_code
    )


def apply_tax(invoice: Invoice, company: Company) -> None:
    """Recomputes every line's tax and the invoice totals from its items.

    Each line is taxed at its own rate, or the invoice's tax_percent if it has
    none. A GST-registered company (one with a GSTIN) gets the CGST+SGST or IGST
    split; any other company gets a single plain tax amount.
    """
    registered = bool(company.gstin)
    interstate = is_interstate(invoice, company)
    zero = Decimal("0.00")
    subtotal = cgst = sgst = igst = tax = zero

    for item in invoice.items:
        rate = item.tax_percent if item.tax_percent is not None else invoice.tax_percent
        if registered:
            split = line_tax(item.line_total, rate, interstate=interstate)
            item.tax_amount = split.total
            cgst += split.cgst
            sgst += split.sgst
            igst += split.igst
        else:
            item.tax_amount = (item.line_total * rate / 100).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
        subtotal += item.line_total
        tax += item.tax_amount

    invoice.subtotal = subtotal
    invoice.cgst_amount, invoice.sgst_amount, invoice.igst_amount = cgst, sgst, igst
    invoice.tax_amount = tax
    invoice.total = subtotal + tax
