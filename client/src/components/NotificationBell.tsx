import { Bell, Check, CheckCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { notificationService } from "@/lib/services";
import { queryClient } from "@/lib/queryClient";
import type { Notification } from "@/lib/database";
import { formatNumber } from "@/lib/format";
import { formatRelativeTime } from "@/lib/localized";
import { cn } from "@/lib/utils";

interface NotificationBellProps {
  email: string;
}

const UNREAD_CAP = 99;

/**
 * Notification bell (header). The popover lists the stored server-generated
 * rows; opening one marks it read. Times are relative ("3 hours ago") through
 * Intl; the unread count is capped at 99+ and announced through the trigger's
 * accessible name.
 */
export function NotificationBell({ email }: NotificationBellProps) {
  const { t, i18n } = useTranslation();
  const {
    data: notifications = [],
    isLoading: notificationsLoading,
    isError,
    refetch,
  } = useQuery<Notification[]>({
    queryKey: ["notifications", email],
    queryFn: () => notificationService.getAll(email),
    enabled: !!email,
  });

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ["notifications", email, "unread-count"],
    queryFn: () => notificationService.getUnreadCount(email),
    enabled: !!email,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications", email] });
    queryClient.invalidateQueries({ queryKey: ["notifications", email, "unread-count"] });
  };

  const markAsRead = useMutation({
    mutationFn: (notificationId: string) => notificationService.markAsRead(notificationId),
    onSuccess: invalidate,
  });

  const markAllAsRead = useMutation({
    mutationFn: () => notificationService.markAllAsRead(email),
    onSuccess: invalidate,
  });

  const unreadLabel = unreadCount > UNREAD_CAP ? t("dashboardV2.notifications.unreadCap", { count: UNREAD_CAP }) : formatNumber(unreadCount, i18n.language);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? t("nav.notificationsUnread", { count: unreadCount }) : t("nav.notifications")}
          data-testid="button-notification-bell"
        >
          <Bell className="size-5" strokeWidth={1.75} aria-hidden="true" />
          {unreadCount > 0 && (
            <Badge
              tone="warning"
              className="absolute -end-1 -top-1 h-5 min-w-5 justify-center px-1 tabular-nums"
              aria-hidden="true"
              data-testid="badge-unread-count"
            >
              {unreadLabel}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-body-sm font-medium text-foreground">{t("nav.notifications")}</h2>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-caption text-muted-foreground"
              onClick={() => markAllAsRead.mutate()}
              loading={markAllAsRead.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck aria-hidden="true" />
              {t("dashboardV2.notifications.markAllRead")}
            </Button>
          )}
        </div>
        <div className="max-h-[min(60vh,24rem)] overflow-y-auto overscroll-contain">
          {notificationsLoading ? (
            <div className="space-y-3 p-4" role="status" aria-busy="true">
              <span className="sr-only">{t("common.loading")}</span>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-2 p-6 text-center" role="alert">
              <p className="text-body-sm text-muted-foreground">{t("dashboardV2.notifications.loadError")}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                {t("common.tryAgain")}
              </Button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <Bell className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
              <p className="text-body-sm text-muted-foreground">{t("dashboardV2.notifications.empty")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((notification) => (
                <li key={notification.id} className={cn("flex items-start gap-2 px-4 py-3", !notification.is_read && "bg-accent/60")} data-testid={`notification-item-${notification.id}`}>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-body-sm font-medium text-foreground">
                      <span className="truncate" dir="auto">{notification.title}</span>
                      {!notification.is_read && (
                        <span className="size-2 shrink-0 rounded-full bg-secondary" aria-hidden="true" />
                      )}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-caption text-muted-foreground" dir="auto">
                      {notification.message}
                    </p>
                    <p className="mt-1 text-caption text-muted-foreground">
                      {formatRelativeTime(notification.created_at, i18n.language)}
                    </p>
                  </div>
                  {!notification.is_read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      onClick={() => markAsRead.mutate(notification.id)}
                      disabled={markAsRead.isPending}
                      aria-label={t("dashboardV2.notifications.markRead")}
                      data-testid={`button-mark-read-${notification.id}`}
                    >
                      <Check className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
