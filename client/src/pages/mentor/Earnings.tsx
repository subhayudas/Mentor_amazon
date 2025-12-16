import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DollarSign, TrendingUp, Calendar, CreditCard } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import type { MentorEarnings as EarningsType } from "@shared/schema";

interface EarningsProps {
  mentorId: string;
}

interface DashboardStats {
  totalSessions: number;
  completedSessions: number;
  averageRating: number;
  totalEarnings: number;
  monthlyEarnings: number;
  pendingBookings: number;
}

export default function Earnings({ mentorId }: EarningsProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';

  const { data: earnings, isLoading: earningsLoading } = useQuery<EarningsType[]>({
    queryKey: ['/api/mentor', mentorId, 'earnings'],
    enabled: !!mentorId,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/mentor', mentorId, 'dashboard'],
    enabled: !!mentorId,
  });

  const groupedEarnings = earnings?.reduce((acc, earning) => {
    const month = earning.payout_month;
    if (!acc[month]) {
      acc[month] = {
        total: 0,
        items: [],
        pending: 0,
        paid: 0,
      };
    }
    acc[month].items.push(earning);
    acc[month].total += parseFloat(earning.amount);
    if (earning.payout_status === 'pending') {
      acc[month].pending += parseFloat(earning.amount);
    } else {
      acc[month].paid += parseFloat(earning.amount);
    }
    return acc;
  }, {} as Record<string, { total: number; items: EarningsType[]; pending: number; paid: number }>);

  const sortedMonths = Object.keys(groupedEarnings || {}).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  );

  const isLoading = earningsLoading || statsLoading;

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-earnings-title">
          {t('mentorPortal.earnings')}
        </h1>
        <p className="text-muted-foreground">
          {t('mentorPortal.earningsSubtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardDescription className="text-sm font-medium">
                  {t('mentorPortal.totalEarnings')}
                </CardDescription>
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/20">
                  <DollarSign className="w-4 h-4 text-green-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${stats?.totalEarnings?.toLocaleString() ?? 0}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardDescription className="text-sm font-medium">
                  {t('mentorPortal.thisMonth')}
                </CardDescription>
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${stats?.monthlyEarnings?.toLocaleString() ?? 0}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardDescription className="text-sm font-medium">
                  {t('mentorPortal.completedSessions')}
                </CardDescription>
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/20">
                  <Calendar className="w-4 h-4 text-purple-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats?.completedSessions ?? 0}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            {t('mentorPortal.monthlyBreakdown')}
          </CardTitle>
          <CardDescription>
            {t('mentorPortal.earningsHistory')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : sortedMonths.length > 0 ? (
            <div className="space-y-6">
              {sortedMonths.map((month) => {
                const monthData = groupedEarnings![month];
                return (
                  <div key={month} className="space-y-3">
                    <div className="flex items-center justify-between gap-4 p-3 bg-muted/50 rounded-lg">
                      <h3 className="font-semibold">{month}</h3>
                      <div className="flex items-center gap-4">
                        <div className="text-sm">
                          <span className="text-muted-foreground">{t('mentorPortal.paid')}: </span>
                          <span className="font-medium text-green-600">
                            ${monthData.paid.toLocaleString()}
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">{t('mentorPortal.pending')}: </span>
                          <span className="font-medium text-orange-600">
                            ${monthData.pending.toLocaleString()}
                          </span>
                        </div>
                        <Badge variant="secondary">
                          ${monthData.total.toLocaleString()}
                        </Badge>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('mentorPortal.date')}</TableHead>
                            <TableHead>{t('mentorPortal.amount')}</TableHead>
                            <TableHead>{t('mentorPortal.currency')}</TableHead>
                            <TableHead>{t('mentorPortal.status')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {monthData.items.map((earning) => (
                            <TableRow key={earning.id} data-testid={`earning-row-${earning.id}`}>
                              <TableCell>
                                {format(parseISO(earning.earned_at), 'MMM d, yyyy')}
                              </TableCell>
                              <TableCell className="font-medium">
                                ${parseFloat(earning.amount).toLocaleString()}
                              </TableCell>
                              <TableCell>{earning.currency}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={earning.payout_status === 'paid' ? 'default' : 'secondary'}
                                  className={earning.payout_status === 'paid' 
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' 
                                    : ''}
                                >
                                  {earning.payout_status === 'paid' 
                                    ? t('mentorPortal.paid') 
                                    : t('mentorPortal.pending')}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <DollarSign className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {t('mentorPortal.noEarnings')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
