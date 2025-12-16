import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Save, User, Building2, Globe } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import type { Mentor } from "@shared/schema";

interface ProfileSettingsProps {
  mentorId: string;
  mentorEmail: string;
}

const profileFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  name_ar: z.string().optional(),
  position: z.string().optional(),
  position_ar: z.string().optional(),
  company: z.string().optional(),
  company_ar: z.string().optional(),
  bio: z.string().min(1, "Bio is required"),
  bio_ar: z.string().optional(),
  expertise: z.string().min(1, "Expertise is required"),
  expertise_ar: z.string().optional(),
  industries: z.string().min(1, "Industries is required"),
  industries_ar: z.string().optional(),
  country: z.string().optional(),
  mentorship_preference: z.enum(["ongoing", "rotating", "either"]).optional(),
  why_joined: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function ProfileSettings({ mentorId, mentorEmail }: ProfileSettingsProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { toast } = useToast();

  const { data: mentor, isLoading } = useQuery<Mentor>({
    queryKey: ['/api/mentors/email', mentorEmail],
    enabled: !!mentorEmail,
  });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: "",
      name_ar: "",
      position: "",
      position_ar: "",
      company: "",
      company_ar: "",
      bio: "",
      bio_ar: "",
      expertise: "",
      expertise_ar: "",
      industries: "",
      industries_ar: "",
      country: "",
      mentorship_preference: undefined,
      why_joined: "",
    },
  });

  useEffect(() => {
    if (mentor) {
      form.reset({
        name: mentor.name || "",
        name_ar: mentor.name_ar || "",
        position: mentor.position || "",
        position_ar: mentor.position_ar || "",
        company: mentor.company || "",
        company_ar: mentor.company_ar || "",
        bio: mentor.bio || "",
        bio_ar: mentor.bio_ar || "",
        expertise: mentor.expertise?.join(", ") || "",
        expertise_ar: mentor.expertise_ar?.join(", ") || "",
        industries: mentor.industries?.join(", ") || "",
        industries_ar: mentor.industries_ar?.join(", ") || "",
        country: mentor.country || "",
        mentorship_preference: mentor.mentorship_preference || undefined,
        why_joined: mentor.why_joined || "",
      });
    }
  }, [mentor, form]);

  const saveMutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      const payload = {
        name: data.name,
        name_ar: data.name_ar || null,
        position: data.position || null,
        position_ar: data.position_ar || null,
        company: data.company || null,
        company_ar: data.company_ar || null,
        bio: data.bio,
        bio_ar: data.bio_ar || null,
        expertise: data.expertise.split(",").map(s => s.trim()).filter(Boolean),
        expertise_ar: data.expertise_ar ? data.expertise_ar.split(",").map(s => s.trim()).filter(Boolean) : null,
        industries: data.industries.split(",").map(s => s.trim()).filter(Boolean),
        industries_ar: data.industries_ar ? data.industries_ar.split(",").map(s => s.trim()).filter(Boolean) : null,
        country: data.country || null,
        mentorship_preference: data.mentorship_preference || null,
        why_joined: data.why_joined || null,
      };
      return apiRequest("PATCH", `/api/mentors/${mentorId}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mentors/email', mentorEmail] });
      toast({
        title: t('common.success'),
        description: t('profileSettings.saveSuccess'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('profileSettings.saveError'),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProfileFormValues) => {
    saveMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-profile-settings-title">
            {t('profileSettings.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('profileSettings.subtitle')}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                {t('profileSettings.personalInfo')}
              </CardTitle>
              <CardDescription>
                {t('profileSettings.personalInfoDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profileSettings.name')}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name_ar"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profileSettings.nameAr')}</FormLabel>
                      <FormControl>
                        <Input {...field} dir="rtl" data-testid="input-name-ar" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('profileSettings.country')}</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-country" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                {t('profileSettings.professionalInfo')}
              </CardTitle>
              <CardDescription>
                {t('profileSettings.professionalInfoDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profileSettings.position')}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-position" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="position_ar"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profileSettings.positionAr')}</FormLabel>
                      <FormControl>
                        <Input {...field} dir="rtl" data-testid="input-position-ar" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profileSettings.company')}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-company" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="company_ar"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profileSettings.companyAr')}</FormLabel>
                      <FormControl>
                        <Input {...field} dir="rtl" data-testid="input-company-ar" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profileSettings.bio')}</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={4} data-testid="input-bio" />
                      </FormControl>
                      <FormDescription>{t('profileSettings.bioHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bio_ar"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profileSettings.bioAr')}</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={4} dir="rtl" data-testid="input-bio-ar" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                {t('profileSettings.expertiseAndIndustries')}
              </CardTitle>
              <CardDescription>
                {t('profileSettings.expertiseAndIndustriesDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="expertise"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profileSettings.expertise')}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-expertise" />
                      </FormControl>
                      <FormDescription>{t('profileSettings.commaSeparated')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="expertise_ar"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profileSettings.expertiseAr')}</FormLabel>
                      <FormControl>
                        <Input {...field} dir="rtl" data-testid="input-expertise-ar" />
                      </FormControl>
                      <FormDescription>{t('profileSettings.commaSeparated')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="industries"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profileSettings.industries')}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-industries" />
                      </FormControl>
                      <FormDescription>{t('profileSettings.commaSeparated')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="industries_ar"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profileSettings.industriesAr')}</FormLabel>
                      <FormControl>
                        <Input {...field} dir="rtl" data-testid="input-industries-ar" />
                      </FormControl>
                      <FormDescription>{t('profileSettings.commaSeparated')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('profileSettings.preferences')}</CardTitle>
              <CardDescription>
                {t('profileSettings.preferencesDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="mentorship_preference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('profileSettings.mentorshipPreference')}</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value || ""}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-mentorship-preference">
                          <SelectValue placeholder={t('profileSettings.selectPreference')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ongoing">{t('profileSettings.ongoing')}</SelectItem>
                        <SelectItem value="rotating">{t('profileSettings.rotating')}</SelectItem>
                        <SelectItem value="either">{t('profileSettings.either')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="why_joined"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('profileSettings.whyJoined')}</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} data-testid="input-why-joined" />
                    </FormControl>
                    <FormDescription>{t('profileSettings.whyJoinedHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              data-testid="button-save-profile"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
