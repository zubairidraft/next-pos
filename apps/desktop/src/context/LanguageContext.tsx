import React, { createContext, useContext, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

type Language = "en" | "ur";
type Direction = "ltr" | "rtl";

interface LanguageContextType {
  language: Language;
  direction: Direction;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  direction: "ltr",
  setLanguage: () => {},
  toggleLanguage: () => {},
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();
  const [language, setLangState] = useState<Language>(
    (localStorage.getItem("nextpos_language") as Language) || "en"
  );

  const direction: Direction = language === "ur" ? "rtl" : "ltr";

  const setLanguage = (lang: Language) => {
    setLangState(lang);
    i18n.changeLanguage(lang);
    localStorage.setItem("nextpos_language", lang);
    document.documentElement.dir = lang === "ur" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  };

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "ur" : "en");
  };

  useEffect(() => {
    document.documentElement.dir = direction;
    document.documentElement.lang = language;
  }, [direction, language]);

  return (
    <LanguageContext.Provider value={{ language, direction, setLanguage, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useAppLanguage = () => useContext(LanguageContext);
