import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { usePrefs } from './db/hooks';
import { TabBar } from './components/TabBar';
import { Toasts } from './components/Toasts';
import { GroupsScreen } from './screens/GroupsScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { GroupDetailScreen } from './screens/GroupDetailScreen';
import { AddExpenseScreen } from './screens/AddExpenseScreen';
import { SettleScreen } from './screens/SettleScreen';
import { FriendsScreen } from './screens/FriendsScreen';
import { ActivityScreen } from './screens/ActivityScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { InstallPrompt } from './components/InstallPrompt';
import { useAuth } from './sync/auth';
import { syncNow } from './sync/sync';
import { PendingInvites } from './components/PendingInvites';

export default function App() {
  const prefs = usePrefs();
  const location = useLocation();
  const { user } = useAuth();

  // Sync when the user signs in and whenever the tab regains focus.
  useEffect(() => {
    if (!user) return;
    void syncNow();
    const onFocus = () => void syncNow();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user]);

  if (prefs === undefined) {
    // initial DB load
    return (
      <div className="app-shell items-center justify-center">
        <div className="h-2 w-24 bg-line rounded-full overflow-hidden">
          <div className="h-full w-1/3 bg-forest animate-pulse" />
        </div>
      </div>
    );
  }

  if (!prefs.onboarded) {
    return (
      <div className="app-shell">
        <OnboardingScreen />
      </div>
    );
  }

  const hideTabs = /^\/(groups\/[^/]+\/(add|edit|settle)|onboarding)/.test(
    location.pathname,
  );

  return (
    <div className="app-shell">
      <main className="flex-1 flex flex-col min-h-0">
        <Routes>
          <Route path="/" element={<Navigate to="/groups" replace />} />
          <Route path="/groups" element={<GroupsScreen />} />
          <Route path="/groups/:id" element={<GroupDetailScreen />} />
          <Route path="/groups/:id/add" element={<AddExpenseScreen />} />
          <Route path="/groups/:id/edit/:expenseId" element={<AddExpenseScreen />} />
          <Route path="/groups/:id/settle" element={<SettleScreen />} />
          <Route path="/friends" element={<FriendsScreen />} />
          <Route path="/activity" element={<ActivityScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/groups" replace />} />
        </Routes>
      </main>
      {!hideTabs && <TabBar />}
      <Toasts />
      <InstallPrompt />
      <PendingInvites />
    </div>
  );
}
