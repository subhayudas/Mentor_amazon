import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { insertMentorSchema, type InsertMentor, type Mentor } from "@shared/schema";
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
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, Users, Clock, Award, Globe, Upload, Loader2 } from "lucide-react";
import { useState, useRef } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

const TIMEZONES = [
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kuwait",
  "Europe/Istanbul",
  "UTC",
];

const EXPERTISE_OPTIONS = {
  "Technical & Product": [
    "AI/ML Model Deployment",
    "API Design",
    "Cloud Architecture (AWS, Azure, GCP)",
    "Cybersecurity",
    "Data Analysis",
    "Data Engineering",
    "Data Visualization",
    "DevOps",
    "Distributed Systems",
    "Machine Learning",
    "Mobile Development",
    "Product Management",
    "Product Strategy",
    "Python Programming",
    "Quality Assurance & Testing",
    "Software Development",
    "SQL",
    "Technical Program Management",
    "User Research",
    "UX/UI Design",
  ],
  "Operations & Business": [
    "Business Analysis",
    "Business Strategy",
    "Change Management",
    "Customer Experience Management",
    "Financial Analysis",
    "Forecasting & Demand Planning",
    "Human Resources & People Experience",
    "Inventory Management",
    "Lean / Six Sigma",
    "Marketing",
    "Marketplace Optimization",
    "Negotiation",
    "Operations Management",
    "Process Improvement",
    "Procurement",
    "Program Management",
    "Project Management",
    "Public Policy",
    "Supply Chain Management",
    "Vendor Management",
  ],
  "Leadership & Core Skills": [
    "Adaptability",
    "Analytical Thinking",
    "Coaching & Mentoring",
    "Communication",
    "Conflict Resolution",
    "Cross-functional Collaboration",
    "Customer Obsession",
    "Decision-Making",
    "Innovation & Creativity",
    "Problem Solving",
    "Stakeholder Management",
    "Strategic Thinking",
    "Team Leadership",
    "Time Management",
  ],
};

const INDUSTRY_OPTIONS = [
  "AI, Data Science & Machine Learning",
  "Automotive, EV & Aerospace",
  "Cloud Computing & IT Services",
  "Consumer Goods",
  "Cybersecurity",
  "E-commerce & Retail",
  "Education & EdTech",
  "Energy & Utilities",
  "Finance & FinTech",
  "Government & Public Sector",
  "Healthcare & Life Sciences",
  "Hospitality & Tourism",
  "Logistics, Transportation & Supply Chain",
  "Manufacturing & Industrial",
  "Media, Advertising & Entertainment",
  "Non-profit & Social Impact",
  "Professional Services",
  "Real Estate & Construction",
  "Technology & Software",
  "Telecommunications",
];

const LANGUAGE_OPTIONS = [
  "English",
  "Arabic",
  "French",
  "German",
  "Spanish",
  "Turkish",
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

export default function MentorOnboarding() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<InsertMentor>({
    resolver: zodResolver(insertMentorSchema.refine(
      (data) => {
        if (!data.cal_link || data.cal_link.trim() === "") {
          return false;
        }
        const calLink = data.cal_link.trim();
        const validPattern = /^[a-z0-9._-]+\/[a-z0-9._-]+$/i;
        return validPattern.test(calLink);
      },
      {
        message: "Please enter a valid Cal.com link (e.g., username/30min)",
        path: ["cal_link"],
      }
    )),
    defaultValues: {
      name: "",
      email: "",
      company: "",
      position: "",
      timezone: "Asia/Dubai",
      country: "",
      photo_url: "",
      bio: "",
      linkedin_url: "",
      cal_link: "",
      expertise: [],
      industries: [],
      languages_spoken: [],
      comms_owner: "exec",
      mentorship_preference: "rotating",
      why_joined: "",
    },
  });

  const createMentorMutation = useMutation<Mentor, Error, InsertMentor>({
    mutationFn: async (data: InsertMentor) => {
      const response = await apiRequest("POST", "/api/mentors", data);
      return await response.json();
    },
    onSuccess: (newMentor: Mentor) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mentors"] });
      toast({
        title: t('mentorOnboarding.successTitle'),
        description: t('mentorOnboarding.successMessage'),
      });
      if (newMentor?.id) {
        setLocation(`/profile/mentor/${newMentor.id}`);
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

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: t('common.error'),
        description: t('mentorOnboarding.invalidImageType'),
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t('common.error'),
        description: t('mentorOnboarding.imageTooLarge'),
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const result = await response.json();
      form.setValue("photo_url", result.url);
      setPhotoPreview(result.url);
      toast({
        title: t('mentorOnboarding.photoUploaded'),
        description: t('mentorOnboarding.photoUploadSuccess'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('mentorOnboarding.photoUploadFailed'),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const commsOwner = form.watch("comms_owner");

  const onSubmit = (data: InsertMentor) => {
    const cleanedData = {
      ...data,
      cal_link: data.cal_link?.trim() || "",
    };
    createMentorMutation.mutate(cleanedData);
  };

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Award className="w-6 h-6 text-primary" />
              {t('mentorOnboarding.contextTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              {t('mentorOnboarding.contextDescription')}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50">
                <Users className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm">{t('mentorOnboarding.benefit1Title')}</h4>
                  <p className="text-xs text-muted-foreground">{t('mentorOnboarding.benefit1Desc')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50">
                <Clock className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm">{t('mentorOnboarding.benefit2Title')}</h4>
                  <p className="text-xs text-muted-foreground">{t('mentorOnboarding.benefit2Desc')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50">
                <Globe className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm">{t('mentorOnboarding.benefit3Title')}</h4>
                  <p className="text-xs text-muted-foreground">{t('mentorOnboarding.benefit3Desc')}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">{t('mentorOnboarding.title')}</CardTitle>
            <CardDescription>
              {t('mentorOnboarding.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('mentorOnboarding.fullName')} *</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} data-testid="input-name" />
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
                      <FormLabel>{t('mentorOnboarding.email')} *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john@example.com" {...field} data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('mentorOnboarding.company')}</FormLabel>
                        <FormControl>
                          <Input placeholder="Amazon" {...field} value={field.value || ""} data-testid="input-company" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('mentorOnboarding.position')}</FormLabel>
                        <FormControl>
                          <Input placeholder="Senior Product Manager" {...field} value={field.value || ""} data-testid="input-position" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('mentorOnboarding.timezone')} *</FormLabel>
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
                      <FormLabel>{t('mentorOnboarding.bio')} *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('mentorOnboarding.bioPlaceholder')}
                          className="min-h-32"
                          {...field}
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
                        <FormLabel>{t('mentorOnboarding.linkedinUrl')}</FormLabel>
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
                        <FormLabel>{t('mentorOnboarding.profilePhoto')}</FormLabel>
                        <div className="flex items-center gap-4">
                          <Avatar className="h-16 w-16">
                            {photoPreview || field.value ? (
                              <AvatarImage src={photoPreview || field.value || ""} alt="Profile" />
                            ) : null}
                            <AvatarFallback>
                              <Upload className="h-6 w-6 text-muted-foreground" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <input
                              type="file"
                              accept="image/*"
                              ref={fileInputRef}
                              onChange={handlePhotoUpload}
                              className="hidden"
                              data-testid="input-photo-file"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isUploading}
                              data-testid="button-upload-photo"
                            >
                              {isUploading ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  {t('mentorOnboarding.uploading')}
                                </>
                              ) : (
                                <>
                                  <Upload className="mr-2 h-4 w-4" />
                                  {t('mentorOnboarding.uploadPhoto')}
                                </>
                              )}
                            </Button>
                            <p className="text-xs text-muted-foreground mt-1">
                              {t('mentorOnboarding.photoHint')}
                            </p>
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="cal_link"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('mentorOnboarding.calLink')} *</FormLabel>
                      <FormControl>
                        <Input placeholder="username/30min" {...field} data-testid="input-calcom" />
                      </FormControl>
                      <FormDescription className="space-y-1">
                        <span>{t('mentorOnboarding.calHelp')}</span>
                        <a 
                          href="https://cal.com/signup" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="block text-primary hover:underline"
                          data-testid="link-setup-cal"
                        >
                          {t('mentorOnboarding.calSetupLink')}
                        </a>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="expertise"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('mentorOnboarding.expertise')} *</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          const currentValue = field.value || [];
                          if (value && !currentValue.includes(value)) {
                            field.onChange([...currentValue, value]);
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-expertise">
                            <SelectValue placeholder={t('mentorOnboarding.addExpertise')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-80">
                          {Object.entries(EXPERTISE_OPTIONS).map(([category, skills]) => (
                            <SelectGroup key={category}>
                              <SelectLabel className="text-primary font-semibold">{category}</SelectLabel>
                              {skills.filter(skill => !(field.value || []).includes(skill)).map((skill) => (
                                <SelectItem key={skill} value={skill}>
                                  {skill}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(field.value || []).map((exp) => (
                          <Badge key={exp} variant="secondary" data-testid={`badge-expertise-${exp}`}>
                            {exp}
                            <button
                              type="button"
                              onClick={() => {
                                field.onChange((field.value || []).filter(item => item !== exp));
                              }}
                              className="ml-1"
                              data-testid={`button-remove-expertise-${exp}`}
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
                  name="industries"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('mentorOnboarding.industriesExperience')} *</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          const currentValue = field.value || [];
                          if (value && !currentValue.includes(value)) {
                            field.onChange([...currentValue, value]);
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-industries">
                            <SelectValue placeholder={t('mentorOnboarding.addIndustries')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {INDUSTRY_OPTIONS.filter(opt => !(field.value || []).includes(opt)).map((ind) => (
                            <SelectItem key={ind} value={ind}>
                              {ind}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(field.value || []).map((ind) => (
                          <Badge key={ind} variant="secondary" data-testid={`badge-industry-${ind}`}>
                            {ind}
                            <button
                              type="button"
                              onClick={() => {
                                field.onChange((field.value || []).filter(item => item !== ind));
                              }}
                              className="ml-1"
                              data-testid={`button-remove-industry-${ind}`}
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
                  name="languages_spoken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('mentorOnboarding.languagesSpoken')} *</FormLabel>
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
                            <SelectValue placeholder={t('mentorOnboarding.addLanguages')} />
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
                  name="comms_owner"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('mentorOnboarding.commsOwner')} *</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex flex-col space-y-1"
                        >
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="exec" data-testid="radio-exec" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              {t('mentorOnboarding.commsExec')}
                            </FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="assistant" data-testid="radio-assistant" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              {t('mentorOnboarding.commsAssistant')}
                            </FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {commsOwner === "assistant" && (
                  <FormField
                    control={form.control}
                    name="assistant_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('mentorOnboarding.assistantEmail')} *</FormLabel>
                        <FormControl>
                          <Input 
                            type="email" 
                            placeholder="assistant@example.com" 
                            {...field} 
                            value={field.value || ""} 
                            data-testid="input-assistant-email" 
                          />
                        </FormControl>
                        <FormDescription>
                          {t('mentorOnboarding.assistantEmailHelp')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="mentorship_preference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('mentorOnboarding.mentorshipPreference')}</FormLabel>
                      <FormDescription>{t('mentorOnboarding.mentorshipPreferenceHelp')}</FormDescription>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value || "rotating"}
                          className="flex flex-col space-y-3 mt-2"
                        >
                          <FormItem className="flex items-start space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="ongoing" data-testid="radio-ongoing" />
                            </FormControl>
                            <div className="flex flex-col">
                              <FormLabel className="font-medium">
                                {t('mentorOnboarding.ongoingMentorship')}
                              </FormLabel>
                              <p className="text-sm text-muted-foreground">
                                {t('mentorOnboarding.ongoingMentorshipDesc')}
                              </p>
                            </div>
                          </FormItem>
                          <FormItem className="flex items-start space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="rotating" data-testid="radio-rotating" />
                            </FormControl>
                            <div className="flex flex-col">
                              <FormLabel className="font-medium">
                                {t('mentorOnboarding.rotatingMentees')}
                              </FormLabel>
                              <p className="text-sm text-muted-foreground">
                                {t('mentorOnboarding.rotatingMenteesDesc')}
                              </p>
                            </div>
                          </FormItem>
                          <FormItem className="flex items-start space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="either" data-testid="radio-either" />
                            </FormControl>
                            <div className="flex flex-col">
                              <FormLabel className="font-medium">
                                {t('mentorOnboarding.eitherMentorship')}
                              </FormLabel>
                              <p className="text-sm text-muted-foreground">
                                {t('mentorOnboarding.eitherMentorshipDesc')}
                              </p>
                            </div>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="why_joined"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('mentorOnboarding.whyJoined')} <span className="text-muted-foreground text-sm font-normal">({t('common.optional')})</span></FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('mentorOnboarding.whyJoinedPlaceholder')}
                          className="min-h-[100px]"
                          {...field}
                          value={field.value || ""}
                          data-testid="textarea-why-joined"
                        />
                      </FormControl>
                      <FormDescription>
                        {t('mentorOnboarding.whyJoinedHelp')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="p-4 border rounded-lg bg-muted/30 text-sm text-muted-foreground">
                  <p className="mb-2">{t('legal.termsAgreement')}</p>
                  <p>{t('legal.disclaimer')}</p>
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
                    disabled={createMentorMutation.isPending}
                    data-testid="button-submit"
                  >
                    {createMentorMutation.isPending ? t('mentorOnboarding.creating') : t('mentorOnboarding.createProfile')}
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
