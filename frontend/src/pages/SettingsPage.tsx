import { useEffect, useState, type FormEvent } from "react";
import { apiClient } from "../api/client";
import { extractErrorMessage } from "../api/errors";
import { stateFromGstin } from "../api/gst";
import { AppLayout } from "../components/AppLayout";
import { StateSelect } from "../components/StateSelect";
import { useAuth } from "../auth/AuthContext";
import type { CompanyOut, UpdateCompany } from "../api/types";

interface CompanyFormState {
  email: string;
  address: string;
  gstin: string;
  stateCode: string;
}

function toForm(company: CompanyOut): CompanyFormState {
  return {
    email: company.email,
    address: company.address ?? "",
    gstin: company.gstin ?? "",
    stateCode: company.state_code ?? "",
  };
}

export function SettingsPage() {
  const { claims } = useAuth();
  // Mirrors require_admin in backend/app/routers/company.py.
  const canEdit = claims?.role === "ADMIN" || claims?.role === "SUPERADMIN";

  const [company, setCompany] = useState<CompanyOut | null>(null);
  const [form, setForm] = useState<CompanyFormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiClient
      .get<CompanyOut>("/company")
      .then(({ data }) => {
        setCompany(data);
        setForm(toForm(data));
      })
      .catch((err) => setError(extractErrorMessage(err)));
  }, []);

  function update(patch: Partial<CompanyFormState>) {
    setSaved(false);
    setForm((current) => (current ? { ...current, ...patch } : current));
  }

  function handleGstinChange(value: string) {
    const gstin = value.toUpperCase();
    // A GSTIN's first two digits are its state, so keep the two in step.
    update({ gstin, stateCode: stateFromGstin(gstin) ?? form?.stateCode ?? "" });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSubmitting(true);
    setFormError(null);
    setSaved(false);
    try {
      const body: UpdateCompany = {
        email: form.email,
        address: form.address || null,
        gstin: form.gstin.trim() || null,
        state_code: form.stateCode || null,
      };
      const { data } = await apiClient.patch<CompanyOut>("/company", body);
      setCompany(data);
      setForm(toForm(data));
      setSaved(true);
    } catch (err) {
      setFormError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <div className="customers-page">
        <div className="customers-header">
          <div>
            <h1>Company settings</h1>
            <p className="page-subtitle">
              These details are printed on every invoice. Add your GSTIN to issue GST tax invoices.
            </p>
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}
        {!company && !error && (
          <div className="loading">
            <span className="spinner" />
            Loading...
          </div>
        )}

        {company && form && (
          <form className="customer-form" onSubmit={handleSubmit}>
            <label>
              Company name
              <input value={company.name} disabled />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => update({ email: e.target.value })}
                disabled={!canEdit}
                required
              />
            </label>
            <label className="span-all">
              Address
              <textarea
                rows={2}
                value={form.address}
                onChange={(e) => update({ address: e.target.value })}
                disabled={!canEdit}
              />
            </label>
            <label>
              GSTIN
              <input
                className="mono"
                value={form.gstin}
                onChange={(e) => handleGstinChange(e.target.value)}
                placeholder="27ABCDE1234F1Z5"
                maxLength={15}
                disabled={!canEdit}
              />
              <span className="field-hint">
                {form.gstin
                  ? "Invoices split GST into CGST + SGST, or IGST for other states."
                  : "Leave empty if you are not GST-registered: invoices then show one plain tax line."}
              </span>
            </label>
            <label>
              State
              <StateSelect
                value={form.stateCode}
                onChange={(stateCode) => update({ stateCode })}
                disabled={!canEdit || Boolean(form.gstin)}
              />
              {form.gstin && <span className="field-hint">Taken from the GSTIN.</span>}
            </label>

            {formError && <p className="form-error">{formError}</p>}
            {saved && <p className="form-success">Company details saved.</p>}

            {canEdit ? (
              <div className="customer-form-actions">
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : "Save changes"}
                </button>
              </div>
            ) : (
              <p className="muted-text span-all">Only an admin can change company details.</p>
            )}
          </form>
        )}
      </div>
    </AppLayout>
  );
}
