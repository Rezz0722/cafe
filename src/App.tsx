import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { SavedCafesProvider } from '@/hooks/useSavedCafes'
import { ScrollToTop } from '@/components/layout/ScrollToTop'
import { HomePage } from '@/pages/HomePage'
import { SearchResultsPage } from '@/pages/SearchResultsPage'
import { CafeDetailPage } from '@/pages/CafeDetailPage'
import { AuthPage } from '@/pages/AuthPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { AdminPanelPage } from '@/pages/AdminPanelPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { authUrl, paths } from '@/routes'

/** Sends signed-out visitors to the login flow, remembering where they were. */
function RequireAuth({ children }: { children: React.ReactElement }) {
  const { isLoggedIn } = useAuth()
  if (!isLoggedIn) return <Navigate to={authUrl(paths.profile)} replace />
  return children
}

export function App() {
  return (
    <AuthProvider>
      <SavedCafesProvider>
        <ScrollToTop />
        <Routes>
          <Route path={paths.home} element={<HomePage />} />
          <Route path={paths.search} element={<SearchResultsPage />} />
          <Route path="/cafe/:id" element={<CafeDetailPage />} />
          <Route path={paths.auth} element={<AuthPage />} />
          <Route
            path={paths.profile}
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route path={paths.admin} element={<AdminPanelPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </SavedCafesProvider>
    </AuthProvider>
  )
}
