import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiClient } from "../api/client";
import { extractErrorMessage } from "../api/errors";
import { AppLayout } from "../components/AppLayout";
import type { CreateCustomer, CustomerOut, UpdateCustomer } from "../api/types";

interface CustomerFormState {
  name: string;
  email: string;
  phone: string;
  address: string;
}

const emptyForm: CustomerFormState = { name: "", email: "", phone: "", address: "" };

export function CustomersPage() {
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
        };
        await apiClient.patch(`/customers/${editingId}`, body);
      } else {
        const body: CreateCustomer = {
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          address: form.address || null,
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
          <h1>Customers</h1>
          <button onClick={openNewForm}>New Customer</button>
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
            {formError && <p className="form-error">{formError}</p>}
            <div className="customer-form-actions">
              <button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : editingId ? "Save changes" : "Create customer"}
              </button>
              <button type="button" onClick={closeForm}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading && <p>Loading...</p>}
        {error && <p className="form-error">{error}</p>}

        {!loading && !error && (
          <table className="customers-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Address</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && (
                <tr>
                  <td colSpan={5}>No customers yet.</td>
                </tr>
              )}
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.name}</td>
                  <td>{customer.email ?? "—"}</td>
                  <td>{customer.phone ?? "—"}</td>
                  <td>{customer.address ?? "—"}</td>
                  <td className="customers-actions">
                    <button onClick={() => openEditForm(customer)}>Edit</button>
                    <button onClick={() => handleDelete(customer.id)}>Delete</button>
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
