"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { ClipboardList, CheckCircle, PartyPopper, Ban, RefreshCw, Bell } from "lucide-react";
import { fetchNotifications, getUnreadCount, markNotificationRead, markAllRead, type Notification } from "@/server/notification-actions";

function notifIcon(type: string): React.ReactNode {
  if (type === "order_assigned" || type === "team_assigned") return <ClipboardList className="h-3.5 w-3.5" />;
  if (type === "setup_done") return <CheckCircle className="h-3.5 w-3.5" />;
  if (type === "account_created") return <PartyPopper className="h-3.5 w-3.5" />;
  if (type === "team_removed") return <Ban className="h-3.5 w-3.5" />;
  if (type === "order_updated") return <RefreshCw className="h-3.5 w-3.5" />;
  return <Bell className="h-3.5 w-3.5" />;
}

const IMPORTANT_TYPES = new Set(["password_reset", "account_created", "team_assigned", "setup_done"]);

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setUnread(await getUnreadCount());
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button onClick={open ? () => setOpen(false) : (async () => { setNotifs(await fetchNotifications(12)); setOpen(true); })}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        aria-label="Notifications">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-kp-danger px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 origin-top-right animate-fade-up rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Notifications</span>
            {unread > 0 && (
              <button onClick={async () => { await markAllRead(); setUnread(0); setNotifs((n) => n.map((x) => ({ ...x, read: 1 }))); }}
                className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] hover:underline">Mark all read</button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifs.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No notifications yet.</p>
            ) : (
              notifs.map((n) => (
                <NotifItem key={n.id} notif={n}
                  onRead={() => { markNotificationRead(n.id); setUnread((u) => Math.max(0, u - 1)); setNotifs((ns) => ns.map((x) => x.id === n.id ? { ...x, read: 1 } : x)); }} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotifItem({ notif, onRead }: { notif: Notification; onRead: () => void }) {
  const Wrapper = notif.link ? ({ children }: { children: React.ReactNode }) => <Link href={notif.link!} onClick={onRead}>{children}</Link> : ({ children }: { children: React.ReactNode }) => <>{children}</>;
  const important = IMPORTANT_TYPES.has(notif.type);
  return (
    <Wrapper>
      <div className={`flex cursor-pointer items-start gap-3 border-b border-gray-50 px-4 py-3 transition-colors hover:bg-gray-50 dark:border-gray-700/50 dark:hover:bg-gray-800/50 ${!notif.read ? "bg-[var(--accent-light)]" : ""}`} onClick={() => { if (!notif.read) onRead(); }}>
        <div className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${important ? "bg-amber-100 dark:bg-amber-900/30" : "bg-gray-100 dark:bg-gray-800"}`}>
          {notifIcon(notif.type)}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm ${notif.read ? "text-gray-500 dark:text-gray-400" : "font-semibold text-gray-800 dark:text-gray-200"}`}>{notif.title}</p>
          {notif.message && <p className="mt-0.5 line-clamp-2 text-xs text-gray-400 dark:text-gray-500">{notif.message}</p>}
        </div>
      </div>
    </Wrapper>
  );
}