import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { insertMenteeSchema, type InsertMentee } from "@shared/schema";
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
import { X } from "lucide-react";
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

export default function MenteeRegistration() {
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
      timezone: "Africa/Cairo",
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
      form.clearErrors("organization_name");
    }
  };

  const createMenteeMutation = useMutation({
    mutationFn: async (data: InsertMentee) => {
      return await apiRequest("POST", "/api/mentees", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mentees"] });
      toast({
        title: "Success!",
        description: "Your profile has been created successfully.",
      });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create profile",
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
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Join MentorConnect</CardTitle>
            <CardDescription>
              Connect with expert mentors from Amazon and beyond
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
                      <FormLabel>Account Type *</FormLabel>
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
                              Individual (Personal account)
                            </FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="organization" data-testid="radio-organization" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              Organization (Company or team account)
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
                      <FormLabel>Full Name *</FormLabel>
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
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="jane@example.com" {...field} data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {userType === "organization" && (
                  <FormField
                    control={form.control}
                    name="organization_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="Acme Corp" {...field} value={field.value || ""} data-testid="input-organization" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="timezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timezone *</FormLabel>
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
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bio</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Tell us about yourself and what you're looking to learn..."
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
                        <FormLabel>LinkedIn URL</FormLabel>
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
                        <FormLabel>Photo URL</FormLabel>
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
                      <FormLabel>Languages Spoken *</FormLabel>
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
                            <SelectValue placeholder="Add languages" />
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
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Areas You're Exploring *</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          const currentValue = field.value || [];
                          if (value && !currentValue.includes(value)) {
                            field.onChange([...currentValue, value]);
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-areas">
                            <SelectValue placeholder="Add areas of interest" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {AREAS_EXPLORING_OPTIONS.filter(opt => !(field.value || []).includes(opt)).map((area) => (
                            <SelectItem key={area} value={area}>
                              {area}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(field.value || []).map((area) => (
                          <Badge key={area} variant="secondary" data-testid={`badge-area-${area}`}>
                            {area}
                            <button
                              type="button"
                              onClick={() => {
                                field.onChange((field.value || []).filter(item => item !== area));
                              }}
                              className="ml-1"
                              data-testid={`button-remove-area-${area}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <FormDescription>
                        Select the skills and areas you want to learn more about
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLocation("/")}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={createMenteeMutation.isPending}
                    data-testid="button-submit"
                  >
                    {createMenteeMutation.isPending ? "Creating Profile..." : "Create Profile"}
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
