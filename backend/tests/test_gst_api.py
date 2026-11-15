"""GST behaviour end to end, through the HTTP API."""

from tests.conftest import register

COMPANY_GSTIN = "27AAPFU0939F1ZV"  # Maharashtra
KARNATAKA = "29"
MAHARASHTRA = "27"


def _register_gst_company(client, auth):
    response = client.patch("/company", json={"gstin": COMPANY_GSTIN, "address": "Pune"}, headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


def _customer(client, auth, **fields):
    response = client.post("/customers", json={"name": "Buyer", **fields}, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


def _product(client, auth, **fields):
    body = {"sku": "SKU-1", "name": "Widget", "unit_price": "1000.00", "stock_quantity": 10, **fields}
    response = client.post("/products", json=body, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


def _invoice(client, auth, customer, items, **fields):
    body = {
        "customer_id": customer["id"],
        "issue_date": "2026-11-15",
        "due_date": "2026-11-30",
        "tax_percent": "18",
        "items": items,
        **fields,
    }
    response = client.post("/invoices", json=body, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


CUSTOM_LINE = {"description": "Consulting", "unit_price": "1000.00", "quantity": 1}


def test_company_gstin_sets_its_state(client, auth):
    company = _register_gst_company(client, auth)
    assert company["gstin"] == COMPANY_GSTIN
    assert company["state_code"] == MAHARASHTRA
    assert client.get("/company", headers=auth).json()["address"] == "Pune"


def test_company_rejects_bad_gstin_and_mismatched_state(client, auth):
    assert client.patch("/company", json={"gstin": "27AAPFU0939F1ZX"}, headers=auth).status_code == 422
    response = client.patch(
        "/company", json={"gstin": COMPANY_GSTIN, "state_code": KARNATAKA}, headers=auth
    )
    assert response.status_code == 422
    assert "does not match" in response.json()["detail"]


def test_customer_state_comes_from_gstin(client, auth):
    customer = _customer(client, auth, gstin=COMPANY_GSTIN.lower())
    assert customer["gstin"] == COMPANY_GSTIN
    assert customer["state_code"] == MAHARASHTRA

    response = client.patch(
        f"/customers/{customer['id']}", json={"state_code": KARNATAKA}, headers=auth
    )
    assert response.status_code == 422


def test_same_state_invoice_splits_cgst_and_sgst(client, auth):
    _register_gst_company(client, auth)
    customer = _customer(client, auth, state_code=MAHARASHTRA)

    invoice = _invoice(client, auth, customer, [CUSTOM_LINE])

    assert invoice["place_of_supply"] == MAHARASHTRA
    assert (invoice["cgst_amount"], invoice["sgst_amount"], invoice["igst_amount"]) == ("90.00", "90.00", "0.00")
    assert invoice["tax_amount"] == "180.00"
    assert invoice["total"] == "1180.00"


def test_other_state_invoice_charges_igst(client, auth):
    _register_gst_company(client, auth)
    customer = _customer(client, auth, state_code=KARNATAKA)

    invoice = _invoice(client, auth, customer, [CUSTOM_LINE])

    assert invoice["place_of_supply"] == KARNATAKA
    assert (invoice["cgst_amount"], invoice["sgst_amount"], invoice["igst_amount"]) == ("0.00", "0.00", "180.00")
    assert invoice["total"] == "1180.00"


def test_explicit_place_of_supply_overrides_customer_state(client, auth):
    _register_gst_company(client, auth)
    customer = _customer(client, auth, state_code=MAHARASHTRA)

    invoice = _invoice(client, auth, customer, [CUSTOM_LINE], place_of_supply=KARNATAKA)

    assert invoice["igst_amount"] == "180.00"


def test_product_line_takes_hsn_and_rate_from_product(client, auth):
    _register_gst_company(client, auth)
    customer = _customer(client, auth, state_code=MAHARASHTRA)
    product = _product(client, auth, hsn_code="4802", gst_rate="12")

    invoice = _invoice(
        client,
        auth,
        customer,
        [{"product_id": product["id"], "quantity": 2}, {**CUSTOM_LINE, "hsn_code": "998311"}],
    )

    product_line, custom_line = invoice["items"]
    assert (product_line["hsn_code"], product_line["tax_percent"], product_line["tax_amount"]) == ("4802", "12.00", "240.00")
    # The custom line has no rate of its own, so it uses the invoice's 18%.
    assert (custom_line["hsn_code"], custom_line["tax_percent"], custom_line["tax_amount"]) == ("998311", None, "180.00")
    assert invoice["subtotal"] == "3000.00"
    assert invoice["cgst_amount"] == invoice["sgst_amount"] == "210.00"
    assert invoice["total"] == "3420.00"


def test_unregistered_company_gets_plain_tax(client, auth):
    customer = _customer(client, auth, state_code=KARNATAKA)

    invoice = _invoice(client, auth, customer, [CUSTOM_LINE])

    assert invoice["tax_amount"] == "180.00"
    assert (invoice["cgst_amount"], invoice["sgst_amount"], invoice["igst_amount"]) == ("0.00", "0.00", "0.00")


def test_changing_customer_moves_place_of_supply(client, auth):
    _register_gst_company(client, auth)
    local = _customer(client, auth, state_code=MAHARASHTRA)
    remote = _customer(client, auth, state_code=KARNATAKA)
    invoice = _invoice(client, auth, local, [CUSTOM_LINE])

    response = client.patch(
        f"/invoices/{invoice['id']}", json={"customer_id": remote["id"]}, headers=auth
    )

    updated = response.json()
    assert updated["place_of_supply"] == KARNATAKA
    assert (updated["cgst_amount"], updated["igst_amount"]) == ("0.00", "180.00")


def test_sending_a_draft_settles_tax_against_current_registration(client, auth):
    customer = _customer(client, auth, state_code=MAHARASHTRA)
    invoice = _invoice(client, auth, customer, [CUSTOM_LINE])  # drafted before registering
    assert invoice["cgst_amount"] == "0.00"

    _register_gst_company(client, auth)
    response = client.post(f"/invoices/{invoice['id']}/status", json={"status": "SENT"}, headers=auth)

    assert response.json()["cgst_amount"] == "90.00"


def test_pdf_is_a_tax_invoice(client, auth):
    _register_gst_company(client, auth)
    customer = _customer(client, auth, state_code=KARNATAKA, gstin="29AAGCB7383J1Z4")
    invoice = _invoice(client, auth, customer, [{**CUSTOM_LINE, "hsn_code": "998311"}])

    response = client.get(f"/invoices/{invoice['id']}/pdf", headers=auth)

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")


def test_gst_details_stay_within_the_tenant(client, auth):
    _register_gst_company(client, auth)
    other = register(client, "Other Co")

    assert client.get("/company", headers=other).json()["gstin"] is None
