import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, Mail, Lock, Users, GraduationCap } from "lucide-react";
import { useState, useEffect } from "react";

const passwordRegex = {
  minLength: /.{8,}/,
  uppercase: /[A-Z]/,
  lowercase: /[a-z]/,
  number: /[0-9]/,
};

const signupSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
  userType: z.enum(["mentor", "mentee"], {
    required_error: "Please select how you want to join",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SignupFormData = z.infer<typeof signupSchema>;

function getPasswordStrength(password: string): { score: number; label: string } {
  let score = 0;
  if (passwordRegex.minLength.test(password)) score += 25;
  if (passwordRegex.uppercase.test(password)) score += 25;
  if (passwordRegex.lowercase.test(password)) score += 25;
  if (passwordRegex.number.test(password)) score += 25;

  if (score <= 25) return { score, label: "weak" };
  if (score <= 50) return { score, label: "fair" };
  if (score <= 75) return { score, label: "good" };
  return { score, label: "strong" };
}

export default function Signup() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: "weak" });

  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      userType: undefined,
    },
  });

  const password = form.watch("password");

  useEffect(() => {
    setPasswordStrength(getPasswordStrength(password || ""));
  }, [password]);

  const signupMutation = useMutation({
    mutationFn: async (data: SignupFormData) => {
      const response = await apiRequest("POST", "/api/auth/signup", {
        email: data.email,
        password: data.password,
        user_type: data.userType,
      });
      return response.json();
    },
    onSuccess: (data) => {
     
      queryClient.setQueryData(["/api/auth/me"], data);
      localStorage.setItem("user", JSON.stringify(data));
      toast({
        title: t("auth.signupSuccess"),
        description: t("auth.accountCreated"),
      });
      const userType = form.getValues("userType");
      if (userType === "mentor") {
        setLocation("/mentor-onboarding");
      } else {
        setLocation("/mentee-registration");
      }
    },
    onError: (error: Error) => {
      toast({
        title: t("auth.signupFailed"),
        description: error.message || t("auth.signupError"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SignupFormData) => {
    signupMutation.mutate(data);
  };

  const getStrengthColor = (label: string) => {
    switch (label) {
      case "weak": return "bg-red-500";
      case "fair": return "bg-yellow-500";
      case "good": return "bg-blue-500";
      case "strong": return "bg-green-500";
      default: return "bg-gray-300";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background">
      <div className="w-full max-w-md mx-auto">
        <Card className="border border-[#D5D9D9]">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-2xl font-bold text-[#232F3E]">
              {t("auth.signup")}
            </CardTitle>
            <CardDescription>
              {t("auth.signupDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-[#0F1111]">
                        {t("auth.email")}
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#565959]" />
                          <Input
                            {...field}
                            type="email"
                            placeholder={t("auth.emailPlaceholder")}
                            className="pl-10 border-[#D5D9D9] rounded-md focus:border-[#FF9900] focus:ring-[#FF9900]"
                            data-testid="input-email"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-[#0F1111]">
                        {t("auth.password")}
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#565959]" />
                          <Input
                            {...field}
                            type="password"
                            placeholder={t("auth.passwordPlaceholder")}
                            className="pl-10 border-[#D5D9D9] rounded-md focus:border-[#FF9900] focus:ring-[#FF9900]"
                            data-testid="input-password"
                          />
                        </div>
                      </FormControl>
                      {password && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center gap-2">
                            <Progress
                              value={passwordStrength.score}
                              className={`h-2 ${getStrengthColor(passwordStrength.label)}`}
                              data-testid="progress-password-strength"
                            />
                          </div>
                          <p className="text-xs text-[#565959]" data-testid="text-password-strength">
                            {t("auth.passwordStrength")}: {t(`auth.strength.${passwordStrength.label}`)}
                          </p>
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-[#0F1111]">
                        {t("auth.confirmPassword")}
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#565959]" />
                          <Input
                            {...field}
                            type="password"
                            placeholder={t("auth.confirmPasswordPlaceholder")}
                            className="pl-10 border-[#D5D9D9] rounded-md focus:border-[#FF9900] focus:ring-[#FF9900]"
                            data-testid="input-confirm-password"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="userType"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel className="text-sm font-medium text-[#0F1111]">
                        {t("auth.userTypeLabel")}
                      </FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="space-y-3"
                        >
                          <div
                            className={`flex items-center space-x-3 p-4 border rounded-md cursor-pointer transition-colors ${
                              field.value === "mentor"
                                ? "border-[#FF9900] bg-orange-50"
                                : "border-[#D5D9D9] hover:border-[#FF9900]"
                            }`}
                            onClick={() => field.onChange("mentor")}
                            data-testid="radio-mentor"
                          >
                            <RadioGroupItem value="mentor" id="mentor" />
                            <Users className="h-5 w-5 text-[#FF9900]" />
                            <div className="flex-1">
                              <label htmlFor="mentor" className="text-sm font-medium cursor-pointer">
                                {t("auth.wantToBeMentor")}
                              </label>
                              <p className="text-xs text-[#565959]">
                                {t("auth.mentorDescription")}
                              </p>
                            </div>
                          </div>
                          <div
                            className={`flex items-center space-x-3 p-4 border rounded-md cursor-pointer transition-colors ${
                              field.value === "mentee"
                                ? "border-[#FF9900] bg-orange-50"
                                : "border-[#D5D9D9] hover:border-[#FF9900]"
                            }`}
                            onClick={() => field.onChange("mentee")}
                            data-testid="radio-mentee"
                          >
                            <RadioGroupItem value="mentee" id="mentee" />
                            <GraduationCap className="h-5 w-5 text-[#FF9900]" />
                            <div className="flex-1">
                              <label htmlFor="mentee" className="text-sm font-medium cursor-pointer">
                                {t("auth.wantToFindMentor")}
                              </label>
                              <p className="text-xs text-[#565959]">
                                {t("auth.menteeDescription")}
                              </p>
                            </div>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full bg-[#FF9900] hover:bg-[#E88B00] text-white font-semibold rounded-md px-6 py-3"
                  disabled={signupMutation.isPending}
                  data-testid="button-signup"
                >
                  {signupMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("auth.signingUp")}
                    </>
                  ) : (
                    t("auth.signupButton")
                  )}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center">
              <p className="text-sm text-[#565959]">
                {t("auth.haveAccount")}{" "}
                <Link
                  href="/login"
                  className="text-[#FF9900] hover:underline font-medium"
                  data-testid="link-login"
                >
                  {t("auth.loginLink")}
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
