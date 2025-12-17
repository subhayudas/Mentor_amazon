import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
  Star, 
  Users,
  CheckCircle,
  Clock,
  Bell,
  MessageSquare,
  ArrowRight
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import type { MentorActivityLog } from "@shared/schema";

interface DashboardStats {
  totalSessions: number;
  completedSessions: number;
  averageRating: number;
  pendingBookings: number;
  feedbackCount: number;
}

interface DashboardHomeProps {
  mentorId: string;
}

export default function DashboardHome({ mentorId }: DashboardHomeProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/mentor', mentorId, 'dashboard'],
    enabled: !!mentorId,
  });

  const { data: activity, isLoading: activityLoading } = useQuery<MentorActivityLog[]>({
    queryKey: ['/api/mentor', mentorId, 'activity'],
    enabled: !!mentorId,
  });

  const statCards = [
    {
      title: t('mentorPortal.totalSessions'),
      value: stats?.totalSessions ?? 0,
      icon: Calendar,
      color: "text-blue-600",
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
      link: null,
    },
    {
      title: t('mentorPortal.avgRating'),
      value: stats?.averageRating ? Number(stats.averageRating).toFixed(1) : "0.0",
      icon: Star,
      color: "text-yellow-600",
      bgColor: "bg-yellow-100 dark:bg-yellow-900/20",
      suffix: "/5.0",
      link: null,
    },
    {
      title: t('mentorPortal.feedbackReceived'),
      value: stats?.feedbackCount ?? 0,
      icon: MessageSquare,
      color: "text-green-600",
      bgColor: "bg-green-100 dark:bg-green-900/20",
      link: null,
    },
    {
      title: t('mentorPortal.pendingBookings'),
      value: stats?.pendingBookings ?? 0,
      icon: Users,
      color: "text-orange-600",
      bgColor: "bg-orange-100 dark:bg-orange-900/20",
      link: "/mentor-portal/bookings",
    },
  ];

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'booking_received':
        return <Bell className="w-4 h-4 text-blue-600" />;
      case 'booking_confirmed':
        return <Calendar className="w-4 h-4 text-green-600" />;
      case 'booking_completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'booking_canceled':
        return <Clock className="w-4 h-4 text-red-600" />;
      case 'task_completed':
        return <CheckCircle className="w-4 h-4 text-purple-600" />;
      case 'rating_received':
        return <Star className="w-4 h-4 text-yellow-600" />;
      default:
        return <Bell className="w-4 h-4 text-gray-600" />;
    }
  };

  const getActivityBadgeVariant = (type: string) => {
    switch (type) {
      case 'booking_received':
        return 'default';
      case 'booking_confirmed':
      case 'booking_completed':
        return 'default';
      case 'booking_canceled':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">
          {t('mentorPortal.dashboardTitle')}
        </h1>
        <p className="text-muted-foreground">
          {t('mentorPortal.dashboardSubtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))
        ) : (
          statCards.map((stat, index) => {
            const CardWrapper = stat.link ? Link : 'div';
            const cardContent = (
              <Card 
                className={stat.link ? "hover-elevate cursor-pointer transition-colors" : ""}
                data-testid={`stat-card-${index}`}
              >
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                  <CardDescription className="text-sm font-medium">
                    {stat.title}
                  </CardDescription>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold">
                      {stat.value}
                      {stat.suffix && (
                        <span className="text-sm font-normal text-muted-foreground">
                          {stat.suffix}
                        </span>
                      )}
                    </div>
                    {stat.link && stat.value > 0 && (
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
            
            return stat.link ? (
              <Link key={index} href={stat.link}>
                {cardContent}
              </Link>
            ) : (
              <div key={index}>{cardContent}</div>
            );
          })
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              {t('mentorPortal.quickStats')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {statsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="text-sm font-medium">{t('mentorPortal.completedSessions')}</span>
                  <Badge variant="secondary">{stats?.completedSessions ?? 0}</Badge>
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="text-sm font-medium">{t('mentorPortal.feedbackReceived')}</span>
                  <Badge variant="secondary">{stats?.feedbackCount ?? 0}</Badge>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              {t('mentorPortal.recentActivity')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : activity && activity.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {activity.slice(0, 5).map((item) => (
                  <div 
                    key={item.id} 
                    className="flex items-start gap-3 p-3 border rounded-lg"
                    data-testid={`activity-${item.id}`}
                  >
                    <div className="mt-0.5">
                      {getActivityIcon(item.activity_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {item.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(parseISO(item.created_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                    <Badge variant={getActivityBadgeVariant(item.activity_type)} className="text-xs">
                      {item.activity_type.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {t('mentorPortal.noActivity')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
