import { useState, useRef, useEffect, useMemo } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

// Country codes with flags and names - sorted alphabetically by country
const COUNTRY_CODES = [
  { code: '+54', country: 'Argentina', flag: '🇦🇷' },
  { code: '+61', country: 'Australia', flag: '🇦🇺' },
  { code: '+43', country: 'Austria', flag: '🇦🇹' },
  { code: '+880', country: 'Bangladesh', flag: '🇧🇩' },
  { code: '+32', country: 'Belgium', flag: '🇧🇪' },
  { code: '+501', country: 'Belize', flag: '🇧🇿' },
  { code: '+55', country: 'Brazil', flag: '🇧🇷' },
  { code: '+1', country: 'Canada', flag: '🇨🇦' },
  { code: '+56', country: 'Chile', flag: '🇨🇱' },
  { code: '+86', country: 'China', flag: '🇨🇳' },
  { code: '+57', country: 'Colombia', flag: '🇨🇴' },
  { code: '+506', country: 'Costa Rica', flag: '🇨🇷' },
  { code: '+45', country: 'Denmark', flag: '🇩🇰' },
  { code: '+20', country: 'Egypt', flag: '🇪🇬' },
  { code: '+503', country: 'El Salvador', flag: '🇸🇻' },
  { code: '+358', country: 'Finland', flag: '🇫🇮' },
  { code: '+33', country: 'France', flag: '🇫🇷' },
  { code: '+49', country: 'Germany', flag: '🇩🇪' },
  { code: '+502', country: 'Guatemala', flag: '🇬🇹' },
  { code: '+504', country: 'Honduras', flag: '🇭🇳' },
  { code: '+852', country: 'Hong Kong', flag: '🇭🇰' },
  { code: '+91', country: 'India', flag: '🇮🇳' },
  { code: '+62', country: 'Indonesia', flag: '🇮🇩' },
  { code: '+353', country: 'Ireland', flag: '🇮🇪' },
  { code: '+972', country: 'Israel', flag: '🇮🇱' },
  { code: '+39', country: 'Italy', flag: '🇮🇹' },
  { code: '+81', country: 'Japan', flag: '🇯🇵' },
  { code: '+254', country: 'Kenya', flag: '🇰🇪' },
  { code: '+60', country: 'Malaysia', flag: '🇲🇾' },
  { code: '+52', country: 'Mexico', flag: '🇲🇽' },
  { code: '+31', country: 'Netherlands', flag: '🇳🇱' },
  { code: '+64', country: 'New Zealand', flag: '🇳🇿' },
  { code: '+505', country: 'Nicaragua', flag: '🇳🇮' },
  { code: '+234', country: 'Nigeria', flag: '🇳🇬' },
  { code: '+47', country: 'Norway', flag: '🇳🇴' },
  { code: '+92', country: 'Pakistan', flag: '🇵🇰' },
  { code: '+507', country: 'Panama', flag: '🇵🇦' },
  { code: '+51', country: 'Peru', flag: '🇵🇪' },
  { code: '+63', country: 'Philippines', flag: '🇵🇭' },
  { code: '+48', country: 'Poland', flag: '🇵🇱' },
  { code: '+351', country: 'Portugal', flag: '🇵🇹' },
  { code: '+7', country: 'Russia', flag: '🇷🇺' },
  { code: '+966', country: 'Saudi Arabia', flag: '🇸🇦' },
  { code: '+65', country: 'Singapore', flag: '🇸🇬' },
  { code: '+27', country: 'South Africa', flag: '🇿🇦' },
  { code: '+82', country: 'South Korea', flag: '🇰🇷' },
  { code: '+34', country: 'Spain', flag: '🇪🇸' },
  { code: '+46', country: 'Sweden', flag: '🇸🇪' },
  { code: '+41', country: 'Switzerland', flag: '🇨🇭' },
  { code: '+886', country: 'Taiwan', flag: '🇹🇼' },
  { code: '+66', country: 'Thailand', flag: '🇹🇭' },
  { code: '+90', country: 'Turkey', flag: '🇹🇷' },
  { code: '+971', country: 'UAE', flag: '🇦🇪' },
  { code: '+380', country: 'Ukraine', flag: '🇺🇦' },
  { code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
  { code: '+1', country: 'United States', flag: '🇺🇸' },
  { code: '+84', country: 'Vietnam', flag: '🇻🇳' },
];

interface CountryCodeSelectProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

export const CountryCodeSelect = ({ value, onChange, id }: CountryCodeSelectProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Parse current value to get code and country
  const [selectedCode, selectedCountry] = value.split('|');
  
  // Find the selected country data
  const selectedData = COUNTRY_CODES.find(
    c => c.code === selectedCode && c.country === selectedCountry
  ) || COUNTRY_CODES.find(c => c.code === selectedCode);

  // Filter countries based on search - search by country name or code
  const filteredCountries = useMemo(() => {
    if (!search.trim()) return COUNTRY_CODES;
    
    const searchLower = search.toLowerCase().trim();
    const searchWithPlus = searchLower.startsWith('+') ? searchLower : `+${searchLower}`;
    
    return COUNTRY_CODES.filter(country => 
      country.country.toLowerCase().includes(searchLower) ||
      country.code.includes(searchWithPlus) ||
      country.code.replace('+', '').startsWith(searchLower.replace('+', ''))
    );
  }, [search]);

  // Auto-detect country when typing a code
  useEffect(() => {
    if (!search.trim()) return;
    
    const searchCode = search.startsWith('+') ? search : `+${search}`;
    
    // Only auto-select if we have an exact code match and search is purely numeric
    if (/^\+?\d+$/.test(search)) {
      const exactMatch = COUNTRY_CODES.find(c => c.code === searchCode);
      if (exactMatch && filteredCountries.length === 1) {
        // Don't auto-select, just highlight - let user confirm
      }
    }
  }, [search, filteredCountries]);

  // Focus search input when popover opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setSearch("");
    }
  }, [open]);

  const handleSelect = (country: typeof COUNTRY_CODES[0]) => {
    onChange(`${country.code}|${country.country}`);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[140px] justify-between flex-shrink-0 px-2"
        >
          <span className="flex items-center gap-1.5 truncate">
            {selectedData ? (
              <>
                <span>{selectedData.flag}</span>
                <span className="font-medium">{selectedData.code}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Select</span>
            )}
          </span>
          <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 z-50 bg-background border shadow-lg" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Search country or type code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          {search && /^\+?\d+$/.test(search) && filteredCountries.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1.5 px-1">
              Type area code (e.g., +63) to find country
            </p>
          )}
        </div>
        <ScrollArea className="h-[250px]">
          <div className="p-1">
            {filteredCountries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No country found</p>
            ) : (
              filteredCountries.map((country, idx) => (
                <button
                  key={`${country.code}-${country.country}-${idx}`}
                  onClick={() => handleSelect(country)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-2 text-sm rounded-md cursor-pointer hover:bg-accent transition-colors",
                    selectedData?.code === country.code && selectedData?.country === country.country && "bg-accent"
                  )}
                >
                  <span className="text-base">{country.flag}</span>
                  <span className="flex-1 text-left truncate">{country.country}</span>
                  <span className="text-muted-foreground font-medium">{country.code}</span>
                  {selectedData?.code === country.code && selectedData?.country === country.country && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export { COUNTRY_CODES };
