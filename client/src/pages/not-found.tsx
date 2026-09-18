import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-[70vh] w-full flex items-center justify-center px-4 pb-12">
      <Card className="w-full max-w-md border-[#D5D9D9]">
        <CardContent className="pt-6">
          <div className="flex items-center mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-[#C40000]" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-[#232F3E]">{t("errors.notFoundTitle")}</h1>
          </div>
          <p className="text-sm text-[#565959]">{t("errors.notFoundBody")}</p>
          <Button asChild className="mt-6 bg-[#FF9900] hover:bg-[#E88B00] text-white" data-testid="button-notfound-home">
            <Link href="/">{t("errors.notFoundHome")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
