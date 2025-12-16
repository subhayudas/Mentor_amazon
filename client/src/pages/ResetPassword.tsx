import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type ResetPasswordValues = {
  password: string;
  confirmPassword: string;
};

export default function ResetPassword() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const searchParams = new URLSearchParams(searchString);
  const token = searchParams.get("token");

  const resetPasswordSchema = z
    .object({
      password: z
        .string()
        .min(8, t("auth.validation.passwordMinLength"))
        .regex(/[A-Z]/, t("auth.validation.passwordUppercase"))
        .regex(/[a-z]/, t("auth.validation.passwordLowercase"))
        .regex(/[0-9]/, t("auth.validation.passwordNumber")),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("auth.validation.passwordsDoNotMatch"),
      path: ["confirmPassword"],
    });

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const password = form.watch("password");

  function getPasswordStrength(password: string): { score: number; label: string } {
    let score = 0;
    if (password.length >= 8) score += 25;
    if (/[A-Z]/.test(password)) score += 25;
    if (/[a-z]/.test(password)) score += 25;
    if (/[0-9]/.test(password)) score += 25;

    if (score <= 25) return { score, label: "weak" };
    if (score <= 50) return { score, label: "fair" };
    if (score <= 75) return { score, label: "good" };
    return { score, label: "strong" };
  }

  const strength = getPasswordStrength(password || "");

  const getStrengthColor = (label: string) => {
    switch (label) {
      case "weak": return "bg-[#C40000]";
      case "fair": return "bg-[#FF9900]";
      case "good": return "bg-[#232F3E]";
      case "strong": return "bg-[#067D62]";
      default: return "bg-[#D5D9D9]";
    }
  };

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: ResetPasswordValues) => {
      const response = await apiRequest("POST", "/api/auth/reset-password", {
        token,
        password: data.password,
      });
      return response.json();
    },
    onSuccess: () => {
      setResetSuccess(true);
    },
    onError: (error: Error) => {
      let errorMessage = t("auth.resetPasswordError");
      try {
        const jsonMatch = error.message.match(/\{.*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          errorMessage = parsed.message || errorMessage;
        }
      } catch {}
      toast({
        title: t("auth.error"),
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ResetPasswordValues) => {
    resetPasswordMutation.mutate(data);
  };

  if (!token) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-[#D5D9D9]">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-[#C40000]/10 rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-[#C40000]" />
            </div>
            <CardTitle className="text-2xl font-bold text-[#232F3E]">
              {t("auth.invalidResetLink")}
            </CardTitle>
            <CardDescription className="text-[#565959]">
              {t("auth.invalidResetLinkDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full bg-[#FF9900] hover:bg-[#E68A00] text-white font-semibold"
              data-testid="button-request-new-link"
              onClick={() => setLocation("/forgot-password")}
            >
              {t("auth.requestNewLink")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (resetSuccess) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-[#D5D9D9]">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-[#067D62]/10 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-[#067D62]" />
            </div>
            <CardTitle className="text-2xl font-bold text-[#232F3E]">
              {t("auth.passwordResetSuccess")}
            </CardTitle>
            <CardDescription className="text-[#565959]">
              {t("auth.passwordResetSuccessDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full bg-[#FF9900] hover:bg-[#E68A00] text-white font-semibold"
              data-testid="button-go-to-login"
              onClick={() => setLocation("/login")}
            >
              {t("auth.goToLogin")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-[#D5D9D9]">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-[#232F3E]">
            {t("auth.resetPasswordTitle")}
          </CardTitle>
          <CardDescription className="text-[#565959]">
            {t("auth.resetPasswordDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-[#0F1111]">
                      {t("auth.newPassword")}
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#565959]" />
                        <Input
                          {...field}
                          type={showPassword ? "text" : "password"}
                          placeholder={t("auth.newPasswordPlaceholder")}
                          className="pl-10 pr-10 border-[#D5D9D9] focus:border-[#FF9900] focus:ring-[#FF9900]"
                          data-testid="input-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#565959] hover:text-[#232F3E]"
                          data-testid="button-toggle-password"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </FormControl>
                    {password && (
                      <div className="mt-2 space-y-1">
                        <div className="h-2 w-full bg-[#D5D9D9] rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-300 ${getStrengthColor(strength.label)}`}
                            style={{ width: `${strength.score}%` }}
                          />
                        </div>
                        <p className="text-xs text-[#565959]">
                          {t("auth.passwordStrength")}: {t(`auth.strength.${strength.label}`)}
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
                      {t("auth.confirmNewPassword")}
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#565959]" />
                        <Input
                          {...field}
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder={t("auth.confirmNewPasswordPlaceholder")}
                          className="pl-10 pr-10 border-[#D5D9D9] focus:border-[#FF9900] focus:ring-[#FF9900]"
                          data-testid="input-confirm-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#565959] hover:text-[#232F3E]"
                          data-testid="button-toggle-confirm-password"
                        >
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={resetPasswordMutation.isPending}
                className="w-full bg-[#FF9900] hover:bg-[#E68A00] text-white font-semibold"
                data-testid="button-reset-password"
              >
                {resetPasswordMutation.isPending
                  ? t("auth.resetting")
                  : t("auth.resetPassword")}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
