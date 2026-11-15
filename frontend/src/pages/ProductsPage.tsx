import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { apiClient } from "../api/client";
import { extractErrorMessage } from "../api/errors";
import { formatRate } from "../api/gst";
import { AppLayout } from "../components/AppLayout";
import { useAuth } from "../auth/AuthContext";
import type { CreateProduct, ProductOut, UpdateProduct } from "../api/types";

interface ProductFormState {
  sku: string;
  name: string;
  description: string;
  unit_price: string;
  hsn_code: string;
  gst_rate: string;
  stock_quantity: string;
  reorder_level: string;
}

const emptyForm: ProductFormState = {
  sku: "",
  name: "",
  description: "",
  unit_price: "",
  hsn_code: "",
  gst_rate: "",
  stock_quantity: "0",
  reorder_level: "0",
};

export function ProductsPage() {
  const { isManager } = useAuth();
  const [products, setProducts] = useState<ProductOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadProducts = useCallback(() => {
    setLoading(true);
    apiClient
      .get<ProductOut[]>("/products")
      .then(({ data }) => setProducts(data))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  function openNewForm() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm(product: ProductOut) {
    setEditingId(product.id);
    setForm({
      sku: product.sku,
      name: product.name,
      description: product.description ?? "",
      unit_price: product.unit_price,
      hsn_code: product.hsn_code ?? "",
      gst_rate: product.gst_rate === null ? "" : formatRate(product.gst_rate),
      stock_quantity: String(product.stock_quantity),
      reorder_level: String(product.reorder_level),
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
        const body: UpdateProduct = {
          sku: form.sku,
          name: form.name,
          description: form.description || null,
          unit_price: form.unit_price,
          hsn_code: form.hsn_code.trim() || null,
          gst_rate: form.gst_rate === "" ? null : form.gst_rate,
          stock_quantity: Number(form.stock_quantity) || 0,
          reorder_level: Number(form.reorder_level) || 0,
        };
        await apiClient.patch(`/products/${editingId}`, body);
      } else {
        const body: CreateProduct = {
          sku: form.sku,
          name: form.name,
          description: form.description || null,
          unit_price: form.unit_price,
          hsn_code: form.hsn_code.trim() || null,
          gst_rate: form.gst_rate === "" ? null : form.gst_rate,
          stock_quantity: Number(form.stock_quantity) || 0,
          reorder_level: Number(form.reorder_level) || 0,
        };
        await apiClient.post("/products", body);
      }
      closeForm();
      loadProducts();
    } catch (err) {
      setFormError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiClient.delete(`/products/${id}`);
      loadProducts();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <AppLayout>
      <div className="customers-page">
        <div className="customers-header">
          <div>
            <h1>Products</h1>
            <p className="page-subtitle">Your catalogue, prices and stock levels.</p>
          </div>
          {isManager && <button className="btn-primary" onClick={openNewForm}>
            <Plus size={16} />
            New product
          </button>}
        </div>

        {formOpen && (
          <form className="customer-form" onSubmit={handleSubmit}>
            <label>
              SKU
              <input
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                required
              />
            </label>
            <label>
              Name
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label>
              Description
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </label>
            <label>
              Unit price
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.unit_price}
                onChange={(e) => setForm((f) => ({ ...f, unit_price: e.target.value }))}
                required
              />
            </label>
            <label>
              HSN / SAC code
              <input
                className="mono"
                inputMode="numeric"
                pattern="[0-9]{4,8}"
                title="4 to 8 digits"
                value={form.hsn_code}
                onChange={(e) => setForm((f) => ({ ...f, hsn_code: e.target.value }))}
                placeholder="Optional"
              />
            </label>
            <label>
              GST %
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.gst_rate}
                onChange={(e) => setForm((f) => ({ ...f, gst_rate: e.target.value }))}
                placeholder="Uses the invoice's default if empty"
              />
            </label>
            <label>
              Stock quantity
              <input
                type="number"
                step="1"
                min="0"
                value={form.stock_quantity}
                onChange={(e) => setForm((f) => ({ ...f, stock_quantity: e.target.value }))}
              />
            </label>
            <label>
              Reorder level
              <input
                type="number"
                step="1"
                min="0"
                value={form.reorder_level}
                onChange={(e) => setForm((f) => ({ ...f, reorder_level: e.target.value }))}
              />
            </label>
            {formError && <p className="form-error">{formError}</p>}
            <div className="customer-form-actions">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Saving..." : editingId ? "Save changes" : "Create product"}
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
                <th>SKU</th>
                <th>Name</th>
                <th>HSN/SAC</th>
                <th className="num">GST %</th>
                <th className="num">Unit price</th>
                <th className="num">Stock</th>
                <th className="num">Reorder level</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr>
                  <td colSpan={8}>No products yet.</td>
                </tr>
              )}
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="mono cell-muted">{product.sku}</td>
                  <td className="cell-strong">{product.name}</td>
                  <td className="mono cell-muted">{product.hsn_code ?? "—"}</td>
                  <td className="num">{product.gst_rate === null ? "—" : `${formatRate(product.gst_rate)}%`}</td>
                  <td className="num">{Number(product.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className={`num ${product.stock_quantity <= product.reorder_level ? "low-stock-value" : ""}`}>
                    {product.stock_quantity}
                  </td>
                  <td className="num cell-muted">{product.reorder_level}</td>
                  <td className="customers-actions">
                    {isManager && (
                      <>
                        <button className="btn-sm" onClick={() => openEditForm(product)}>Edit</button>
                        <button className="btn-sm btn-danger" onClick={() => handleDelete(product.id)}>Archive</button>
                      </>
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
