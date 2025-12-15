import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { insertMenteeSchema, type InsertMentee, type Mentee } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, BookOpen, Users, Target, Sparkles, Check } from "lucide-react";
import { useState } from "react";

const TIMEZONES = [
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kuwait",
  "Europe/Istanbul",
  "UTC",
];

const LANGUAGE_OPTIONS = [
  "English",
  "Arabic",
  "French",
  "German",
  "Spanish",
  "Turkish",
];

const AREAS_EXPLORING_OPTIONS = [
  "Career Development",
  "Product Management",
  "Engineering",
  "Design",
  "Marketing",
  "Sales",
  "Operations",
  "Data Science",
  "Leadership",
  "E-commerce",
  "Cloud Computing",
  "UX Design",
  "Digital Marketing",
];

const COUNTRY_OPTIONS = [
  "United Arab Emirates",
  "Saudi Arabia",
  "Egypt",
  "Kuwait",
  "Qatar",
  "Bahrain",
  "Oman",
  "Jordan",
  "Lebanon",
  "Morocco",
  "Tunisia",
  "Algeria",
  "Iraq",
  "Syria",
  "Palestine",
  "Turkey",
  "Pakistan",
  "India",
  "Bangladesh",
  "United Kingdom",
  "United States",
  "Germany",
  "France",
  "Other",
];

const SECTOR_OPTIONS = [
  "technology",
  "healthcare",
  "education",
  "finance",
  "nonprofit",
  "government",
  "retail",
  "manufacturing",
  "media",
  "consulting",
  "other",
];

const ORG_SIZE_OPTIONS = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1000+",
];

const EXPERIENCE_AREA_OPTIONS = [
  "leadership",
  "careerGrowth",
  "technicalSkills",
  "communication",
  "networking",
  "workLifeBalance",
  "projectManagement",
  "teamBuilding",
  "innovation",
  "strategicThinking",
  "conflictResolution",
  "mentoring",
  "other",
] as const;

export default function MenteeRegistration() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const form = useForm<InsertMentee>({
    resolver: zodResolver(insertMenteeSchema.refine(
      (data) => {
        if (data.user_type === "organization") {
          const trimmed = data.organization_name?.trim() || "";
          return trimmed.length > 0;
        }
        return true;
      },
      {
        message: "Organization name is required for organization accounts",
        path: ["organization_name"],
      }
    )),
    defaultValues: {
      name: "",
      email: "",
      user_type: "individual",
      organization_name: "",
      organization_website: "",
      organization_sector: "",
      organization_size: "",
      organization_mission: "",
      organization_needs: "",
      country: "",
      timezone: "Asia/Dubai",
      photo_url: "",
      bio: "",
      linkedin_url: "",
      languages_spoken: [],
      areas_exploring: [],
    },
  });

  const userType = form.watch("user_type");

  const handleUserTypeChange = (value: "individual" | "organization") => {
    form.setValue("user_type", value);
    if (value === "individual") {
      form.setValue("organization_name", "");
      form.setValue("organization_website", "");
      form.setValue("organization_sector", "");
      form.setValue("organization_size", "");
      form.setValue("organization_mission", "");
      form.setValue("organization_needs", "");
      form.clearErrors("organization_name");
    }
  };

  const createMenteeMutation = useMutation<Mentee, Error, InsertMentee>({
    mutationFn: async (data: InsertMentee) => {
      const response = await apiRequest("POST", "/api/mentees", data);
      return await response.json();
    },
    onSuccess: (newMentee: Mentee) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mentees"] });
      toast({
        title: t('menteeRegistration.successTitle'),
        description: t('menteeRegistration.successMessage'),
      });
      if (newMentee?.id) {
        localStorage.setItem("menteeId", newMentee.id);
        localStorage.setItem("menteeEmail", newMentee.email);
        localStorage.setItem("menteeName", newMentee.name);
        window.dispatchEvent(new Event("userRegistered"));
        setLocation(`/profile/mentee/${newMentee.id}`);
      } else {
        toast({
          title: t('common.error'),
          description: t('errors.somethingWentWrong'),
          variant: "destructive",
        });
        setLocation("/");
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message || t('errors.somethingWentWrong'),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertMentee) => {
    const cleanedData = {
      ...data,
      organization_name: data.organization_name?.trim() || null,
    };
    createMenteeMutation.mutate(cleanedData);
  };

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              {t('menteeRegistration.contextTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              {t('menteeRegistration.contextDescription')}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50">
                <Users className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm">{t('menteeRegistration.benefit1Title')}</h4>
                  <p className="text-xs text-muted-foreground">{t('menteeRegistration.benefit1Desc')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50">
                <Target className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm">{t('menteeRegistration.benefit2Title')}</h4>
                  <p className="text-xs text-muted-foreground">{t('menteeRegistration.benefit2Desc')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50">
                <BookOpen className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm">{t('menteeRegistration.benefit3Title')}</h4>
                  <p className="text-xs text-muted-foreground">{t('menteeRegistration.benefit3Desc')}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">{t('menteeRegistration.title')}</CardTitle>
            <CardDescription>
              {t('menteeRegistration.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="user_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('menteeRegistration.accountType')} *</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={(value) => handleUserTypeChange(value as "individual" | "organization")}
                          defaultValue={field.value}
                          className="flex flex-col space-y-1"
                        >
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="individual" data-testid="radio-individual" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              {t('menteeRegistration.individual')} ({t('menteeRegistration.individualDesc')})
                            </FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="organization" data-testid="radio-organization" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              {t('menteeRegistration.organization')} ({t('menteeRegistration.organizationDesc')})
                            </FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('menteeRegistration.fullName')} *</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane Smith" {...field} data-testid="input-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('menteeRegistration.email')} *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="jane@example.com" {...field} data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {userType === "organization" && (
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                    <h3 className="font-medium">{t('menteeRegistration.organizationInfo')}</h3>
                    
                    <FormField
                      control={form.control}
                      name="organization_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('menteeRegistration.organizationName')} *</FormLabel>
                          <FormControl>
                            <Input placeholder="Acme Corp" {...field} value={field.value || ""} data-testid="input-organization" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="organization_website"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('menteeRegistration.organizationWebsite')}</FormLabel>
                          <FormControl>
                            <Input placeholder="https://example.com" {...field} value={field.value || ""} data-testid="input-org-website" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="organization_sector"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('menteeRegistration.organizationSector')}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger data-testid="select-sector">
                                  <SelectValue placeholder={t('menteeRegistration.selectSector')} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {SECTOR_OPTIONS.map((sector) => (
                                  <SelectItem key={sector} value={sector}>
                                    {t(`sectors.${sector}`)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="organization_size"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('menteeRegistration.organizationSize')}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger data-testid="select-size">
                                  <SelectValue placeholder={t('menteeRegistration.selectSize')} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {ORG_SIZE_OPTIONS.map((size) => (
                                  <SelectItem key={size} value={size}>
                                    {t(`orgSizes.${size}`)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="organization_mission"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('menteeRegistration.organizationMission')}</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={t('menteeRegistration.missionPlaceholder')}
                              className="min-h-20"
                              {...field}
                              value={field.value || ""}
                              data-testid="input-org-mission"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="organization_needs"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('menteeRegistration.organizationNeeds')}</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={t('menteeRegistration.needsPlaceholder')}
                              className="min-h-20"
                              {...field}
                              value={field.value || ""}
                              data-testid="input-org-needs"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('menteeRegistration.timezone')} *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-timezone">
                              <SelectValue placeholder="Select your timezone" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TIMEZONES.map((tz) => (
                              <SelectItem key={tz} value={tz}>
                                {tz}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('menteeRegistration.country')}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-country">
                              <SelectValue placeholder={t('menteeRegistration.selectCountry')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {COUNTRY_OPTIONS.map((country) => (
                              <SelectItem key={country} value={country}>
                                {country}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('menteeRegistration.bio')}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('menteeRegistration.bioPlaceholder')}
                          className="min-h-24"
                          {...field}
                          value={field.value || ""}
                          data-testid="input-bio"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="linkedin_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('menteeRegistration.linkedinUrl')}</FormLabel>
                        <FormControl>
                          <Input placeholder="https://linkedin.com/in/..." {...field} value={field.value || ""} data-testid="input-linkedin" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="photo_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('menteeRegistration.photoUrl')}</FormLabel>
                        <FormControl>
                          <Input placeholder="https://..." {...field} value={field.value || ""} data-testid="input-photo" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="languages_spoken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('menteeRegistration.languagesSpoken')} *</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          const currentValue = field.value || [];
                          if (value && !currentValue.includes(value)) {
                            field.onChange([...currentValue, value]);
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-languages">
                            <SelectValue placeholder={t('menteeRegistration.addLanguages')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LANGUAGE_OPTIONS.filter(opt => !(field.value || []).includes(opt)).map((lang) => (
                            <SelectItem key={lang} value={lang}>
                              {lang}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(field.value || []).map((lang) => (
                          <Badge key={lang} variant="secondary" data-testid={`badge-language-${lang}`}>
                            {lang}
                            <button
                              type="button"
                              onClick={() => {
                                field.onChange((field.value || []).filter(item => item !== lang));
                              }}
                              className="ml-1"
                              data-testid={`button-remove-language-${lang}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="areas_exploring"
                  render={({ field }) => {
                    const selectedAreas = field.value || [];
                    const toggleArea = (area: string) => {
                      if (selectedAreas.includes(area)) {
                        field.onChange(selectedAreas.filter((a: string) => a !== area));
                      } else {
                        field.onChange([...selectedAreas, area]);
                      }
                    };
                    const hasOtherSelected = selectedAreas.includes("other");
                    
                    return (
                      <FormItem>
                        <FormLabel>{t('experienceAreas.title')} *</FormLabel>
                        <div className="flex flex-wrap gap-2" data-testid="experience-areas-container">
                          {EXPERIENCE_AREA_OPTIONS.map((area) => {
                            const isSelected = selectedAreas.includes(area);
                            return (
                              <Badge
                                key={area}
                                variant={isSelected ? "default" : "outline"}
                                className={`cursor-pointer transition-colors ${
                                  isSelected 
                                    ? "bg-primary text-primary-foreground" 
                                    : "hover:bg-primary/10"
                                }`}
                                onClick={() => toggleArea(area)}
                                data-testid={`badge-experience-${area}`}
                              >
                                {isSelected && <Check className="w-3 h-3 mr-1" />}
                                {t(`experienceAreas.options.${area}`)}
                              </Badge>
                            );
                          })}
                        </div>
                        <FormDescription>
                          {t('experienceAreas.help')}
                        </FormDescription>
                        <FormMessage />
                        
                        {hasOtherSelected && (
                          <FormField
                            control={form.control}
                            name="goals"
                            render={({ field: goalsField }) => (
                              <FormItem className="mt-4">
                                <FormLabel>{t('menteeRegistration.goals')}</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder={t('menteeRegistration.goalsPlaceholder')}
                                    className="min-h-24"
                                    {...goalsField}
                                    value={goalsField.value || ""}
                                    data-testid="input-goals"
                                  />
                                </FormControl>
                                <FormDescription>
                                  {t('menteeRegistration.goalsHelp')}
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                      </FormItem>
                    );
                  }}
                />

                <div className="p-4 border rounded-lg bg-muted/30 text-sm text-muted-foreground">
                  <p className="mb-2">{t('legal.termsAgreement')}</p>
                  <p>{t('legal.privacyNotice')}</p>
                </div>

                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLocation("/")}
                    data-testid="button-cancel"
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={createMenteeMutation.isPending}
                    data-testid="button-submit"
                  >
                    {createMenteeMutation.isPending ? t('menteeRegistration.creating') : t('menteeRegistration.createProfile')}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
