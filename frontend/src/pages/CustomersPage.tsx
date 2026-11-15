import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { apiClient } from "../api/client";
import { extractErrorMessage } from "../api/errors";
import { stateFromGstin, stateName } from "../api/gst";
import { AppLayout } from "../components/AppLayout";
import { StateSelect } from "../components/StateSelect";
import { useAuth } from "../auth/AuthContext";
import type { CreateCustomer, CustomerOut, UpdateCustomer } from "../api/types";

interface CustomerFormState {
  name: string;
  email: string;
  phone: string;
  address: string;
  gstin: string;
  stateCode: string;
}

const emptyForm: CustomerFormState = { name: "", email: "", phone: "", address: "", gstin: "", stateCode: "" };

export function CustomersPage() {
  const { isManager } = useAuth();
  const [customers, setCustomers] = useState<CustomerOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadCustomers = useCallback(() => {
    setLoading(true);
    apiClient
      .get<CustomerOut[]>("/customers")
      .then(({ data }) => setCustomers(data))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  function openNewForm() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm(customer: CustomerOut) {
    setEditingId(customer.id);
    setForm({
      name: customer.name,
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      address: customer.address ?? "",
      gstin: customer.gstin ?? "",
      stateCode: customer.state_code ?? "",
    });
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (editingId) {
        const body: UpdateCustomer = {
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          address: form.address || null,
          gstin: form.gstin.trim() || null,
          state_code: form.stateCode || null,
        };
        await apiClient.patch(`/customers/${editingId}`, body);
      } else {
        const body: CreateCustomer = {
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          address: form.address || null,
          gstin: form.gstin.trim() || null,
          state_code: form.stateCode || null,
        };
        await apiClient.post("/customers", body);
      }
      closeForm();
      loadCustomers();
    } catch (err) {
      setFormError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiClient.delete(`/customers/${id}`);
      loadCustomers();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <AppLayout>
      <div className="customers-page">
        <div className="customers-header">
          <div>
            <h1>Customers</h1>
            <p className="page-subtitle">The businesses and people you bill.</p>
          </div>
          <button className="btn-primary" onClick={openNewForm}>
            <Plus size={16} />
            New customer
          </button>
        </div>

        {formOpen && (
          <form className="customer-form" onSubmit={handleSubmit}>
            <label>
              Name
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </label>
            <label>
              Phone
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </label>
            <label>
              Address
              <input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </label>
            <label>
              GSTIN
              <input
                className="mono"
                value={form.gstin}
                onChange={(e) => {
                  const gstin = e.target.value.toUpperCase();
                  // A GSTIN's first two digits are its state, so keep the two in step.
                  setForm((f) => ({ ...f, gstin, stateCode: stateFromGstin(gstin) ?? f.stateCode }));
                }}
                placeholder="Optional - for GST-registered customers"
                maxLength={15}
              />
            </label>
            <label>
              State
              <StateSelect
                value={form.stateCode}
                onChange={(stateCode) => setForm((f) => ({ ...f, stateCode }))}
                disabled={Boolean(form.gstin)}
              />
              <span className="field-hint">Decides CGST + SGST or IGST on this customer's invoices.</span>
            </label>
            {formError && <p className="form-error">{formError}</p>}
            <div className="customer-form-actions">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Saving..." : editingId ? "Save changes" : "Create customer"}
              </button>
              <button type="button" onClick={closeForm}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading && (
          <div className="loading">
            <span className="spinner" />
            Loading...
          </div>
        )}
        {error && <p className="form-error">{error}</p>}

        {!loading && !error && (
          <table className="customers-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Address</th>
                <th>State / GSTIN</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && (
                <tr>
                  <td colSpan={6}>No customers yet.</td>
                </tr>
              )}
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td className="cell-strong">{customer.name}</td>
                  <td>{customer.email ?? "—"}</td>
                  <td>{customer.phone ?? "—"}</td>
                  <td>{customer.address ?? "—"}</td>
                  <td>
                    {stateName(customer.state_code) ?? "—"}
                    {customer.gstin && <div className="mono cell-muted">{customer.gstin}</div>}
                  </td>
                  <td className="customers-actions">
                    <button className="btn-sm" onClick={() => openEditForm(customer)}>Edit</button>
                    {isManager && (
                      <button className="btn-sm btn-danger" onClick={() => handleDelete(customer.id)}>Archive</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  );
}
