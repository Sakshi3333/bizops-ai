"""add gst fields

Revision ID: c3a91f2e7b64
Revises: 7758f779cfc5
Create Date: 2026-11-15 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3a91f2e7b64'
down_revision: Union[str, None] = '7758f779cfc5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('companies', sa.Column('address', sa.Text(), nullable=True))
    op.add_column('companies', sa.Column('gstin', sa.String(length=15), nullable=True))
    op.add_column('companies', sa.Column('state_code', sa.String(length=2), nullable=True))

    op.add_column('customers', sa.Column('gstin', sa.String(length=15), nullable=True))
    op.add_column('customers', sa.Column('state_code', sa.String(length=2), nullable=True))

    op.add_column('products', sa.Column('hsn_code', sa.String(length=8), nullable=True))
    op.add_column('products', sa.Column('gst_rate', sa.Numeric(precision=5, scale=2), nullable=True))

    op.add_column('invoices', sa.Column('place_of_supply', sa.String(length=2), nullable=True))
    op.add_column('invoices', sa.Column('cgst_amount', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False))
    op.add_column('invoices', sa.Column('sgst_amount', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False))
    op.add_column('invoices', sa.Column('igst_amount', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False))

    op.add_column('invoice_items', sa.Column('hsn_code', sa.String(length=8), nullable=True))
    op.add_column('invoice_items', sa.Column('tax_percent', sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column('invoice_items', sa.Column('tax_amount', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False))

    # Existing invoices were taxed at one flat rate with no GST split. Keep their
    # totals exactly as issued (cgst/sgst/igst stay 0, so they still show a single
    # "Tax" line) and only spread that tax over the lines for display.
    op.execute(
        """
        UPDATE invoice_items
        SET tax_amount = ROUND(
            line_total * (SELECT tax_percent FROM invoices WHERE invoices.id = invoice_items.invoice_id) / 100.0,
            2
        )
        """
    )


def downgrade() -> None:
    op.drop_column('invoice_items', 'tax_amount')
    op.drop_column('invoice_items', 'tax_percent')
    op.drop_column('invoice_items', 'hsn_code')
    op.drop_column('invoices', 'igst_amount')
    op.drop_column('invoices', 'sgst_amount')
    op.drop_column('invoices', 'cgst_amount')
    op.drop_column('invoices', 'place_of_supply')
    op.drop_column('products', 'gst_rate')
    op.drop_column('products', 'hsn_code')
    op.drop_column('customers', 'state_code')
    op.drop_column('customers', 'gstin')
    op.drop_column('companies', 'state_code')
    op.drop_column('companies', 'gstin')
    op.drop_column('companies', 'address')
