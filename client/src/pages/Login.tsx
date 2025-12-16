import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
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
import { Loader2, Mail, Lock } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

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
      const response = await apiRequest("POST", "/api/auth/login", {
        email: data.email,
        password: data.password,
      });
      return response.json();
    },
    onSuccess: (data) => {
      localStorage.setItem("user", JSON.stringify(data));
      toast({
        title: t("auth.loginSuccess"),
        description: t("auth.welcomeBack"),
      });
      setLocation("/");
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
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-center justify-between">
                  <FormField
                    control={form.control}
                    name="rememberMe"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2">
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
                  <Link
                    href="#"
                    className="text-sm text-[#FF9900] hover:underline"
                    data-testid="link-forgot-password"
                  >
                    {t("auth.forgotPassword")}
                  </Link>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-[#FF9900] hover:bg-[#E88B00] text-white font-semibold rounded-md px-6 py-3"
                  disabled={loginMutation.isPending}
                  data-testid="button-login"
                >
                  {loginMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("auth.loggingIn")}
                    </>
                  ) : (
                    t("auth.loginButton")
                  )}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center">
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
