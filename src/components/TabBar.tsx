import { NavLink } from 'react-router-dom';

const tabs = [
  {
    to: '/groups',
    label: 'Groups',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <path
          d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3H4V7zm0 5h16v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    to: '/friends',
    label: 'Friends',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <circle cx="9" cy="9" r="3.2" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="17" cy="11" r="2.4" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M3 19c.8-3 3-4.5 6-4.5s5.2 1.5 6 4.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M15 18c.7-1.8 2.3-2.8 4-2.8 1.4 0 2.4.5 3 1.3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    to: '/activity',
    label: 'Activity',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M12 7v5l3 2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M19.4 13.6a7.7 7.7 0 0 0 0-3.2l2-1.5-2-3.5-2.3.9a7.7 7.7 0 0 0-2.8-1.6L13.8 2h-3.6l-.5 2.7a7.7 7.7 0 0 0-2.8 1.6l-2.3-.9-2 3.5 2 1.5a7.7 7.7 0 0 0 0 3.2l-2 1.5 2 3.5 2.3-.9a7.7 7.7 0 0 0 2.8 1.6l.5 2.7h3.6l.5-2.7a7.7 7.7 0 0 0 2.8-1.6l2.3.9 2-3.5-2-1.5z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export function TabBar() {
  return (
    <nav
      className="sticky bottom-0 z-30 bg-cream/95 backdrop-blur border-t border-line/60"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="grid grid-cols-4">
        {tabs.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition ${
                  isActive ? 'text-forest' : 'text-ink-muted'
                }`
              }
            >
              {t.icon}
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
