import React, { createContext, useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";

type Language = "en";
type Direction = "ltr";

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

  useEffect(() => {
    i18n.changeLanguage("en");
    document.documentElement.dir = "ltr";
    document.documentElement.lang = "en";
  }, [i18n]);

  return (
    <LanguageContext.Provider
      value={{
        language: "en",
        direction: "ltr",
        setLanguage: () => {},
        toggleLanguage: () => {},
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useAppLanguage = () => useContext(LanguageContext);
