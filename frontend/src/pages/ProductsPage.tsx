import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiClient } from "../api/client";
import { extractErrorMessage } from "../api/errors";
import { AppLayout } from "../components/AppLayout";
import type { CreateProduct, ProductOut, UpdateProduct } from "../api/types";

interface ProductFormState {
  sku: string;
  name: string;
  description: string;
  unit_price: string;
  stock_quantity: string;
  reorder_level: string;
}

const emptyForm: ProductFormState = {
  sku: "",
  name: "",
  description: "",
  unit_price: "",
  stock_quantity: "0",
  reorder_level: "0",
};

export function ProductsPage() {
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
          <h1>Products</h1>
          <button onClick={openNewForm}>New Product</button>
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
              <button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : editingId ? "Save changes" : "Create product"}
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
                <th>SKU</th>
                <th>Name</th>
                <th>Unit price</th>
                <th>Stock</th>
                <th>Reorder level</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr>
                  <td colSpan={6}>No products yet.</td>
                </tr>
              )}
              {products.map((product) => (
                <tr key={product.id}>
                  <td>{product.sku}</td>
                  <td>{product.name}</td>
                  <td>{product.unit_price}</td>
                  <td>{product.stock_quantity}</td>
                  <td>{product.reorder_level}</td>
                  <td className="customers-actions">
                    <button onClick={() => openEditForm(product)}>Edit</button>
                    <button onClick={() => handleDelete(product.id)}>Delete</button>
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
