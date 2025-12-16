import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type ForgotPasswordValues = {
  email: string;
};

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [emailSent, setEmailSent] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const forgotPasswordSchema = z.object({
    email: z.string().email(t("auth.validation.emailInvalid")),
  });

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (data: ForgotPasswordValues) => {
      const response = await apiRequest("POST", "/api/auth/forgot-password", data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || t("auth.forgotPasswordError"));
      }
      return response.json();
    },
    onSuccess: (_data, variables) => {
      setSubmittedEmail(variables.email);
      setEmailSent(true);
    },
    onError: (error: Error) => {
      toast({
        title: t("auth.error"),
        description: error.message || t("auth.forgotPasswordError"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ForgotPasswordValues) => {
    forgotPasswordMutation.mutate(data);
  };

  if (emailSent) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-[#D5D9D9]">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-[#067D62]/10 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-[#067D62]" />
            </div>
            <CardTitle className="text-2xl font-bold text-[#232F3E]">
              {t("auth.checkYourEmail")}
            </CardTitle>
            <CardDescription className="text-[#565959]">
              {t("auth.resetEmailSent", { email: submittedEmail })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-center text-[#565959]">
              {t("auth.resetEmailInstructions")}
            </p>
            <div className="flex flex-col gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setEmailSent(false);
                  form.reset();
                }}
                className="w-full border-[#D5D9D9] text-[#232F3E]"
                data-testid="button-try-different-email"
              >
                {t("auth.tryDifferentEmail")}
              </Button>
              <Button
                variant="ghost"
                className="w-full text-[#FF9900] hover:text-[#CC7A00]"
                data-testid="link-back-to-login"
                onClick={() => setLocation("/login")}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t("auth.backToLogin")}
              </Button>
            </div>
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
            {t("auth.forgotPasswordTitle")}
          </CardTitle>
          <CardDescription className="text-[#565959]">
            {t("auth.forgotPasswordDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#565959]" />
                        <Input
                          {...field}
                          type="email"
                          placeholder={t("auth.emailPlaceholder")}
                          className="pl-10 border-[#D5D9D9] focus:border-[#FF9900] focus:ring-[#FF9900]"
                          data-testid="input-email"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={forgotPasswordMutation.isPending}
                className="w-full bg-[#FF9900] hover:bg-[#E68A00] text-white font-semibold"
                data-testid="button-send-reset-link"
              >
                {forgotPasswordMutation.isPending
                  ? t("auth.sending")
                  : t("auth.sendResetLink")}
              </Button>

              <div className="text-center">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-[#FF9900] hover:text-[#CC7A00]"
                  data-testid="link-back-to-login"
                  onClick={() => setLocation("/login")}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  {t("auth.backToLogin")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
