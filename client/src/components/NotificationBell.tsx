import { Bell, Check, CheckCheck } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Notification } from "@shared/schema";

interface NotificationBellProps {
  email: string;
}

export function NotificationBell({ email }: NotificationBellProps) {
  const { data: notifications = [], isLoading: notificationsLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications", email],
    enabled: !!email,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications", email, "unread-count"],
    enabled: !!email,
  });

  const unreadCount = unreadData?.count ?? 0;

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", email] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", email, "unread-count"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/notifications/${email}/mark-all-read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", email] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", email, "unread-count"] });
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsReadMutation.mutate(notification.id);
    }
  };

  const formatTime = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return dateString;
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="button-notification-bell"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs"
              data-testid="badge-unread-count"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h4 className="font-semibold text-sm">Notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto py-1 px-2 text-xs text-muted-foreground"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all as read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[300px]">
          {notificationsLoading ? (
            <div className="flex items-center justify-center h-full p-4">
              <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-4 text-center">
              <Bell className="h-8 w-8 text-muted-foreground mb-2" />
              <span className="text-sm text-muted-foreground">No notifications yet</span>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  className={`w-full text-left px-4 py-3 hover-elevate transition-colors ${
                    notification.is_read ? "bg-background" : "bg-muted/50"
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                  data-testid={`notification-item-${notification.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium truncate ${
                          notification.is_read ? "text-foreground" : "text-foreground"
                        }`}>
                          {notification.title}
                        </p>
                        {!notification.is_read && (
                          <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatTime(notification.created_at)}
                      </p>
                    </div>
                    {!notification.is_read && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsReadMutation.mutate(notification.id);
                        }}
                        disabled={markAsReadMutation.isPending}
                        data-testid={`button-mark-read-${notification.id}`}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
