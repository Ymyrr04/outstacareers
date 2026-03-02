import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { ChevronDown, ChevronUp, CalendarIcon, Trophy, Briefcase, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { type HiringRequest } from '@/hooks/useHiringRequests';

import czaAvatar from '@/assets/team/cza.png';
import kristineAvatar from '@/assets/team/kristine.png';
import eduardoAvatar from '@/assets/team/eduardo.png';
import markAvatar from '@/assets/team/mark.png';
import liezlAvatar from '@/assets/team/liezl-new.png';

const ADMIN_AVATARS: Record<string, string> = {
  'czarina@outsta.io': czaAvatar,
  'kristine@outsta.io': kristineAvatar,
  'eduardo@outsta.io': eduardoAvatar,
  'mark@outsta.io': markAvatar,
  'liezl@outsta.io': liezlAvatar,
};

const ADMIN_NAMES: Record<string, string> = {
  'czarina@outsta.io': 'Czarina',
  'kristine@outsta.io': 'Kristine',
  'eduardo@outsta.io': 'Eduardo',
  'mark@outsta.io': 'Mark',
  'liezl@outsta.io': 'Liezl',
};

interface AdminUser {
  user_id: string;
  email: string;
}

interface RecruiterAnalyticsProps {
  requests: HiringRequest[];
  adminUsers: AdminUser[];
}

interface RecruiterStats {
  email: string;
  name: string;
  avatar?: string;
  closedCount: number;
  industries: Record<string, number>;
  roles: Record<string, number>;
}

export const RecruiterAnalytics = ({ requests, adminUsers }: RecruiterAnalyticsProps) => {
  const [expandedRecruiter, setExpandedRecruiter] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));

  // Filter closed requests within date range (auto-swap if start > end)
  const filteredClosedRequests = useMemo(() => {
    const rangeStart = startDate <= endDate ? startDate : endDate;
    const rangeEnd = startDate <= endDate ? endDate : startDate;
    return requests.filter(r => {
      if (r.pipeline_stage !== 'closed' || !r.closed_at) return false;
      const closedDate = parseISO(r.closed_at);
      return isWithinInterval(closedDate, { start: rangeStart, end: rangeEnd });
    });
  }, [requests, startDate, endDate]);

  // Calculate stats per recruiter
  const recruiterStats = useMemo(() => {
    const stats: Record<string, RecruiterStats> = {};
    
    // Initialize with known recruiters (Mark and Liezl excluded from display)
    const keyRecruiters = ['czarina@outsta.io', 'kristine@outsta.io', 'eduardo@outsta.io'];
    keyRecruiters.forEach(email => {
      stats[email] = {
        email,
        name: ADMIN_NAMES[email] || email.split('@')[0],
        avatar: ADMIN_AVATARS[email],
        closedCount: 0,
        industries: {},
        roles: {},
      };
    });

    // Process closed requests
    filteredClosedRequests.forEach(r => {
      const admin = adminUsers.find(a => a.user_id === r.assigned_admin_id);
      const email = admin?.email?.toLowerCase();
      
      if (!email) return;
      
      // Initialize if new recruiter
      if (!stats[email]) {
        stats[email] = {
          email,
          name: ADMIN_NAMES[email] || email.split('@')[0],
          avatar: ADMIN_AVATARS[email],
          closedCount: 0,
          industries: {},
          roles: {},
        };
      }
      
      stats[email].closedCount++;
      
      // Track industry
      const industry = r.industry || 'Unknown';
      stats[email].industries[industry] = (stats[email].industries[industry] || 0) + 1;
      
      // Track role/job title
      const role = r.job_title || 'Unknown';
      stats[email].roles[role] = (stats[email].roles[role] || 0) + 1;
    });

    // Sort by closed count descending, filter out those with 0 placements only if others have placements
    return Object.values(stats).sort((a, b) => b.closedCount - a.closedCount);
  }, [filteredClosedRequests, adminUsers]);

  const toggleExpand = (email: string) => {
    setExpandedRecruiter(prev => prev === email ? null : email);
  };

  const getTopItems = (record: Record<string, number>, limit = 5) => {
    return Object.entries(record)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  };

  return (
    <div className="space-y-3">
      {/* Date Range Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Period:</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs">
              <CalendarIcon className="w-3 h-3 mr-1.5" />
              {format(startDate, 'MMM d, yyyy')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 z-50" align="start">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={(date) => date && setStartDate(date)}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        <span className="text-xs text-muted-foreground">to</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs">
              <CalendarIcon className="w-3 h-3 mr-1.5" />
              {format(endDate, 'MMM d, yyyy')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 z-50" align="start">
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={(date) => date && setEndDate(date)}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        <Badge variant="secondary" className="text-xs">
          {filteredClosedRequests.length} placements
        </Badge>
      </div>

      {/* Recruiter Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {recruiterStats.map((stat) => {
          const isExpanded = expandedRecruiter === stat.email;
          const topIndustries = getTopItems(stat.industries, 3);
          const topRoles = getTopItems(stat.roles, 5);

          return (
            <Card 
              key={stat.email} 
              className={cn(
                "cursor-pointer transition-all duration-200 hover:shadow-md",
                isExpanded && "ring-2 ring-primary/40"
              )}
              onClick={() => toggleExpand(stat.email)}
            >
              <CardContent className="p-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      {stat.avatar && <AvatarImage src={stat.avatar} alt={stat.name} />}
                      <AvatarFallback className="text-xs bg-primary/10">{stat.name[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{stat.name}</p>
                      <p className="text-[10px] text-muted-foreground">{stat.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Trophy className="w-4 h-4 text-amber-500" />
                      <span className="font-bold text-lg">{stat.closedCount}</span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && stat.closedCount > 0 && (
                  <div className="mt-3 pt-3 border-t space-y-3">
                    {/* Industries */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">Industries</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {topIndustries.map(([industry, count]) => (
                          <Badge key={industry} variant="outline" className="text-[10px] py-0">
                            {industry} ({count})
                          </Badge>
                        ))}
                        {topIndustries.length === 0 && (
                          <span className="text-[10px] text-muted-foreground">No data</span>
                        )}
                      </div>
                    </div>

                    {/* Roles */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">Roles Placed</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {topRoles.map(([role, count]) => (
                          <Badge key={role} variant="secondary" className="text-[10px] py-0">
                            {role} ({count})
                          </Badge>
                        ))}
                        {topRoles.length === 0 && (
                          <span className="text-[10px] text-muted-foreground">No data</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Preview when collapsed */}
                {!isExpanded && stat.closedCount > 0 && topIndustries.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {topIndustries.slice(0, 2).map(([industry]) => (
                      <Badge key={industry} variant="outline" className="text-[10px] py-0">
                        {industry}
                      </Badge>
                    ))}
                    {Object.keys(stat.industries).length > 2 && (
                      <Badge variant="outline" className="text-[10px] py-0">
                        +{Object.keys(stat.industries).length - 2}
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
