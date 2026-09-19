import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useSearch, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { authService } from "@/lib/services";
import { clearRoleStorage } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { safeNext, ssoErrorKey, ssoLoginHref } from "@/lib/ssoClient";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Mail, Lock, AlertCircle, ChevronDown, ShieldCheck } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const [passwordOpen, setPasswordOpen] = useState(false);

  // api/auth/callback/amazon sends failures back here as ?error=sso_* (+ &reason= on integ).
  const searchParams = new URLSearchParams(searchString);
  const ssoErrorMessageKey = ssoErrorKey(searchParams.get("error"));
  const ssoReason = searchParams.get("reason");
  // RouteGuard / MentorOnboarding send anonymous visitors here with ?next=<same-origin path>.
  const nextPath = safeNext(searchParams.get("next"), "");

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      return authService.login({
        email: data.email,
        password: data.password,
      });
    },
    onSuccess: (data) => {
      localStorage.setItem("user", JSON.stringify(data));

      // Set role-specific localStorage values for immediate navigation updates.
      // Always clear the opposite role first so a previous session's ids can't
      // leak into this one. These mirrors are conveniences only — access control
      // derives identity from the authenticated session, not from storage.
      if (data.user_type === 'mentor') {
        clearRoleStorage('mentor');
        if (data.profile_id) localStorage.setItem("mentorId", data.profile_id);
        localStorage.setItem("mentorEmail", data.email);
      } else if (data.user_type === 'mentee') {
        clearRoleStorage('mentee');
        if (data.profile_id) localStorage.setItem("menteeId", data.profile_id);
        localStorage.setItem("menteeEmail", data.email);
      } else {
        clearRoleStorage();
      }

      // Dispatch event to notify Navigation component of user registration
      window.dispatchEvent(new CustomEvent("userRegistered"));

      queryClient.clear();
      toast({
        title: t("auth.loginSuccess"),
        description: t("auth.welcomeBack"),
      });
      if (nextPath) {
        setLocation(nextPath);
        return;
      }
      if (data.user_type === 'mentor') {
        setLocation(data.profile_id ? "/mentor-portal" : "/mentor-onboarding");
      } else if (data.user_type === 'admin') {
        setLocation("/admin");
      } else {
        setLocation("/");
      }
    },
    onError: (error: Error) => {
      toast({
        title: t("auth.loginFailed"),
        description: error.message || t("auth.invalidCredentials"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background">
      <div className="w-full max-w-md mx-auto">
        <Card className="border border-[#D5D9D9]">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-2xl font-bold text-[#232F3E]">
              {t("auth.login")}
            </CardTitle>
            <CardDescription>
              {t("auth.loginDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {ssoErrorMessageKey && (
              <Alert variant="destructive" className="border-[#C40000]/40 text-[#C40000]" data-testid="alert-sso-error">
                {/* Icon inside the title (not a direct child) so the Alert's physical left-4 rule does not fight RTL. */}
                <AlertTitle className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t("auth.sso.errorTitle")}
                </AlertTitle>
                <AlertDescription className="text-[#0F1111]">
                  <p>{t(ssoErrorMessageKey)}</p>
                  {ssoReason && (
                    <p className="mt-1 font-mono text-xs text-[#565959]" data-testid="text-sso-error-reason">
                      {t("auth.sso.errorReference", { reason: ssoReason })}
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <a
                href={ssoLoginHref(nextPath)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#FF9900] px-6 py-3 text-sm font-semibold text-white hover:bg-[#E88B00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9900] focus-visible:ring-offset-2"
                data-testid="link-amazon-sso"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                {t("auth.sso.signInWithAmazon")}
              </a>
              <p className="text-center text-xs text-[#565959]">{t("auth.sso.amazonHint")}</p>
            </div>

            <div className="flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-[#D5D9D9]" />
              <span className="text-xs text-[#565959]">{t("auth.sso.or")}</span>
              <span className="h-px flex-1 bg-[#D5D9D9]" />
            </div>

            <Collapsible open={passwordOpen} onOpenChange={setPasswordOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md border border-[#D5D9D9] px-4 py-2.5 text-sm font-medium text-[#0F1111] hover:bg-[#F7F8F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9900] focus-visible:ring-offset-2"
                  data-testid="button-toggle-password-login"
                >
                  <span className="text-start">{t("auth.sso.passwordDisclosure")}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-[#565959] transition-transform ${passwordOpen ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
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
                              <Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#565959]" />
                              <Input
                                {...field}
                                type="email"
                                placeholder={t("auth.emailPlaceholder")}
                                className="ps-10 border-[#D5D9D9] rounded-md focus:border-[#FF9900] focus:ring-[#FF9900]"
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
                              <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#565959]" />
                              <Input
                                {...field}
                                type="password"
                                placeholder={t("auth.passwordPlaceholder")}
                                className="ps-10 border-[#D5D9D9] rounded-md focus:border-[#FF9900] focus:ring-[#FF9900]"
                                data-testid="input-password"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="rememberMe"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-remember-me"
                            />
                          </FormControl>
                          <FormLabel className="text-sm font-normal cursor-pointer">
                            {t("auth.rememberMe")}
                          </FormLabel>
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full bg-[#FF9900] hover:bg-[#E88B00] text-white font-semibold rounded-md px-6 py-3"
                      disabled={loginMutation.isPending}
                      data-testid="button-login"
                    >
                      {loginMutation.isPending ? (
                        <>
                          <Loader2 className="me-2 h-4 w-4 animate-spin" />
                          {t("auth.loggingIn")}
                        </>
                      ) : (
                        t("auth.loginButton")
                      )}
                    </Button>
                  </form>
                </Form>
              </CollapsibleContent>
            </Collapsible>

            <div className="text-center space-y-2">
              <Link
                href="/forgot-password"
                className="text-sm text-[#0066C0] hover:text-[#C45500] hover:underline"
                data-testid="link-forgot-password"
              >
                {t("auth.forgotPassword", "Forgot Password?")}
              </Link>
              <p className="text-sm text-[#565959]">
                {t("auth.noAccount")}{" "}
                <Link
                  href="/signup"
                  className="text-[#FF9900] hover:underline font-medium"
                  data-testid="link-signup"
                >
                  {t("auth.signupLink")}
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
