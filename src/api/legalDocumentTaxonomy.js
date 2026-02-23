import api from "./client";

// Admin taxonomy
export async function adminListDocCategories() {
  const res = await api.get("/admin/legal-document-taxonomy/categories");
  return res.data;
}

export async function adminUpdateDocCategory(id, payload) {
  const res = await api.put(`/admin/legal-document-taxonomy/categories/${id}`, payload);
  return res.data;
}

export async function adminListDocSubCategories({ categoryId } = {}) {
  const res = await api.get("/admin/legal-document-taxonomy/subcategories", {
    params: categoryId ? { categoryId } : {},
  });
  return res.data;
}

export async function adminCreateDocSubCategory(payload) {
  const res = await api.post("/admin/legal-document-taxonomy/subcategories", payload);
  return res.data;
}

export async function adminUpdateDocSubCategory(id, payload) {
  const res = await api.put(`/admin/legal-document-taxonomy/subcategories/${id}`, payload);
  return res.data;
}

export async function adminDisableDocSubCategory(id) {
  const res = await api.delete(`/admin/legal-document-taxonomy/subcategories/${id}`);
  return res.data;
}