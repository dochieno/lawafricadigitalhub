import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./routes/ProtectedRoute";
import AdminOrInstitutionAdminRoute from "./routes/AdminOrInstitutionAdminRoute";
import AdminRoute from "./routes/AdminRoute";
import AdminTocTest from "./pages/dashboard/admin/AdminTocTest";

import AdminLLRImport from "./pages/dashboard/admin/AdminLLRImport";
import LawReportReader from "./pages/dashboard/LawReportReader";
import Login from "./pages/Login";
import Register from "./pages/Register";
import TwoFactor from "./pages/TwoFactor";
import TwoFactorSetup from "./pages/TwoFactorSetup";

// ✅ Paystack return handler (public route)
import PaystackReturn from "./pages/payments/PaystackReturn";
import ResetPassword from "./pages/ResetPassword";

import SecurityDashboard from "./pages/dashboard/SecurityDashboard";
import InstitutionApprovalDashboard from "./pages/dashboard/InstitutionApprovalDashboard";
import AdminReportContent from "./pages/dashboard/admin/AdminReportContent";
import AdminInstitutions from "./pages/dashboard/admin/AdminInstitutions";
import AdminContentProducts from "./pages/dashboard/admin/AdminContentProducts";
import AdminInstitutionAdmins from "./pages/dashboard/admin/AdminInstitutionAdmins";
import AdminInstitutionSubscriptions from "./pages/dashboard/admin/AdminInstitutionSubscriptions";
import AdminInstitutionBundleSubscriptions from "./pages/dashboard/admin/AdminInstitutionBundleSubscriptions";
import AdminProductDocuments from "./pages/dashboard/admin/AdminProductDocuments";
import AdminDocuments from "./pages/dashboard/admin/AdminDocuments";
import AdminInstitutionUsers from "./pages/dashboard/admin/AdminInstitutionUsers";
import AdminUsers from "./pages/dashboard/admin/AdminUsers";
import AdminLLRServices from "./pages/dashboard/admin/AdminLLRServices";
import InstitutionMembersAdmin from "./pages/dashboard/institution/InstitutionMembersAdmin";
import AdminSubscriptionRequests from "./pages/dashboard/approvals/AdminSubscriptionRequests";
import AppShell from "./layout/AppShell";
import DevContentBlocksTest from "./pages/dashboard/DevContentBlocksTest";

import Explore from "./pages/dashboard/Explore";
import Library from "./pages/dashboard/Library";
import AdminTrials from "./pages/dashboard/admin/AdminTrials";
import RequestTrial from "./pages/dashboard/RequestTrial";
import "./styles/lawAfricaBrand.css";

// ✅ Home -> Global Admin dashboard (charts) only for Global Admin
import GlobalAdminHomeSwitch from "./pages/dashboard/GlobalAdminHomeSwitch";

import DocumentDetails from "./pages/documents/DocumentDetails";
import DocumentReader from "./pages/documents/DocumentReader";

// ✅ Law Reports
import LawReports from "./pages/dashboard/LawReports";

// =====================
// ✅ FINANCE (Admin-only)
// =====================
import AdminInvoices from "./pages/dashboard/admin/AdminInvoices";
import AdminInvoiceDetail from "./pages/dashboard/admin/AdminInvoiceDetail";
import AdminInvoiceSettings from "./pages/dashboard/admin/AdminInvoiceSettings";
import AdminPayments from "./pages/dashboard/admin/AdminPayments";
import AdminUserSubscriptions from "./pages/dashboard/admin/AdminUserSubscriptions";

// ✅ NEW: VAT Rates Admin
import AdminVATRates from "./pages/dashboard/admin/AdminVatRates";

// ✅ NEW: Landing Page
import LandingPage from "./pages/LandingPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* ===================== */}
          {/* PUBLIC ROUTES */}
          {/* ===================== */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />

          {/* ✅ Reset password (support both with/without trailing slash) */}
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/reset-password/" element={<ResetPassword />} />

          <Route path="/register" element={<Register />} />
          <Route path="/twofactor" element={<TwoFactor />} />
          <Route path="/twofactor-setup" element={<TwoFactorSetup />} />

          {/* ✅ Paystack redirects here after payment */}
          <Route path="/payments/paystack/return" element={<PaystackReturn />} />

          {/* ✅ OPTIONAL FRIENDLY ALIASES (protected) */}
          <Route
            path="/law-reports"
            element={
              <ProtectedRoute>
                <Navigate to="/dashboard/law-reports" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <Navigate to="/dashboard/law-reports" replace />
              </ProtectedRoute>
            }
          />

          {/* ===================== */}
          {/* PROTECTED APP */}
          {/* ===================== */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            {/* Base */}
            <Route index element={<GlobalAdminHomeSwitch />} />

            <Route path="explore" element={<Explore />} />
            <Route path="library" element={<Library />} />

            {/* ✅ Law Reports */}
            <Route path="law-reports" element={<LawReports />} />
            <Route path="law-reports/:id" element={<LawReportReader />} />
            <Route path="trials" element={<RequestTrial />} />
            <Route path="security" element={<SecurityDashboard />} />

            {/* ===================== */}
            {/* APPROVALS */}
            {/* ===================== */}
            <Route element={<AdminOrInstitutionAdminRoute />}>
              <Route path="approvals" element={<InstitutionApprovalDashboard />} />
              <Route path="approvals/subscription-requests" element={<AdminSubscriptionRequests />} />
              <Route path="approvals/members" element={<InstitutionMembersAdmin />} />
            </Route>

            {/* ===================== */}
            {/* ADMIN */}
            {/* ===================== */}
            <Route element={<AdminRoute />}>
              <Route path="admin/institutions" element={<AdminInstitutions />} />
              <Route path="admin/content-products" element={<AdminContentProducts />} />
              <Route path="admin/documents" element={<AdminDocuments />} />
              <Route path="admin/toc-test" element={<AdminTocTest />} />
              <Route path="admin/llr-services" element={<AdminLLRServices />} />
              <Route path="admin/llr-services/import" element={<AdminLLRImport />} />
              <Route path="/dashboard/dev/content-blocks" element={<DevContentBlocksTest />} />
              <Route path="admin/llr-services/:legalDocumentId/content" element={<AdminReportContent />} />

              <Route path="admin/institution-subscriptions" element={<AdminInstitutionSubscriptions />} />
              <Route path="admin/institution-bundle-subscriptions" element={<AdminInstitutionBundleSubscriptions />} />
              <Route path="admin/user-subscriptions" element={<AdminUserSubscriptions />} />
              <Route path="admin/trials" element={<AdminTrials />} />
              <Route path="admin/institution-admins" element={<AdminInstitutionAdmins />} />
              <Route path="admin/content-products/:productId/documents" element={<AdminProductDocuments />} />
              <Route path="admin/institutions/:id/users" element={<AdminInstitutionUsers />} />
              <Route path="admin/users" element={<AdminUsers />} />

              {/* ===================== */}
              {/* ✅ FINANCE (Admin-only) */}
              {/* ===================== */}
              <Route path="admin/finance/invoices" element={<AdminInvoices />} />
              <Route path="admin/finance/invoices/:id" element={<AdminInvoiceDetail />} />
              <Route path="admin/finance/invoice-settings" element={<AdminInvoiceSettings />} />
              <Route path="admin/finance/vat-rates" element={<AdminVATRates />} />
              <Route path="admin/finance/payments" element={<AdminPayments />} />
            </Route>

            {/* Documents */}
            <Route path="documents/:id" element={<DocumentDetails />} />
            <Route path="documents/:id/read" element={<DocumentReader />} />
          </Route>

          {/* ===================== */}
          {/* REDIRECTS */}
          {/* ===================== */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
