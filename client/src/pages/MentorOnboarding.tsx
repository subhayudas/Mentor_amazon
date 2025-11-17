import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { insertMentorSchema, type InsertMentor } from "@shared/schema";
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

const EXPERTISE_OPTIONS = [
  "Product Management",
  "Engineering",
  "Design",
  "Marketing",
  "Sales",
  "Operations",
  "Data Science",
  "Cloud Computing",
  "UX Design",
  "Digital Marketing",
  "System Design",
  "Machine Learning",
  "E-commerce",
  "Leadership",
];

const INDUSTRY_OPTIONS = [
  "Technology",
  "E-commerce",
  "Retail",
  "Cloud Computing",
  "Marketing",
  "Design",
  "Logistics",
  "Operations",
  "Data Analytics",
];

const LANGUAGE_OPTIONS = [
  "English",
  "Arabic",
  "French",
  "German",
  "Spanish",
  "Turkish",
];

export default function MentorOnboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const form = useForm<InsertMentor>({
    resolver: zodResolver(insertMentorSchema.refine(
      (data) => {
        if (!data.calendly_link || data.calendly_link.trim() === "") {
          return false;
        }
        try {
          const url = new URL(data.calendly_link);
          const isHttps = url.protocol === "http:" || url.protocol === "https:";
          const isCalendly = url.hostname === "calendly.com" || url.hostname.endsWith(".calendly.com");
          return isHttps && isCalendly;
        } catch {
          return false;
        }
      },
      {
        message: "Please enter a valid Calendly URL (e.g., https://calendly.com/your-link)",
        path: ["calendly_link"],
      }
    )),
    defaultValues: {
      name: "",
      email: "",
      company: "",
      position: "",
      timezone: "Africa/Cairo",
      photo_url: "",
      bio: "",
      linkedin_url: "",
      calendly_link: "",
      expertise: [],
      industries: [],
      languages_spoken: [],
      comms_owner: "exec",
    },
  });

  const createMentorMutation = useMutation({
    mutationFn: async (data: InsertMentor) => {
      return await apiRequest("POST", "/api/mentors", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mentors"] });
      toast({
        title: "Success!",
        description: "Your mentor profile has been created successfully.",
      });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create mentor profile",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertMentor) => {
    const cleanedData = {
      ...data,
      calendly_link: data.calendly_link?.trim() || "",
    };
    createMentorMutation.mutate(cleanedData);
  };

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Become a Mentor</CardTitle>
            <CardDescription>
              Join MentorConnect and share your expertise with Amazon employees and the wider community
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
                      <FormLabel>Full Name *</FormLabel>
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
                      <FormLabel>Email *</FormLabel>
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
                        <FormLabel>Company</FormLabel>
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
                        <FormLabel>Position</FormLabel>
                        <FormControl>
                          <Input placeholder="Senior Product Manager" {...field} value={field.value || ""} data-testid="input-position" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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
                      <FormLabel>Bio *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Tell us about yourself, your experience, and what you can help with..."
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
                  name="calendly_link"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Calendly Link *</FormLabel>
                      <FormControl>
                        <Input placeholder="https://calendly.com/your-link" {...field} data-testid="input-calendly" />
                      </FormControl>
                      <FormDescription>
                        Your personal Calendly scheduling link where mentees can book sessions
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
                      <FormLabel>Areas of Expertise *</FormLabel>
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
                            <SelectValue placeholder="Add expertise areas" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {EXPERTISE_OPTIONS.filter(opt => !(field.value || []).includes(opt)).map((exp) => (
                            <SelectItem key={exp} value={exp}>
                              {exp}
                            </SelectItem>
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
                      <FormLabel>Industries *</FormLabel>
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
                            <SelectValue placeholder="Add industries" />
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
                  name="comms_owner"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Communication Owner *</FormLabel>
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
                              Executive (I manage my own calendar)
                            </FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="assistant" data-testid="radio-assistant" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              Assistant (My assistant manages my calendar)
                            </FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
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
                    disabled={createMentorMutation.isPending}
                    data-testid="button-submit"
                  >
                    {createMentorMutation.isPending ? "Creating Profile..." : "Create Mentor Profile"}
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
