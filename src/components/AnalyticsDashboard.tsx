import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Eye, MousePointerClick, FileText, TrendingUp, Globe, Users } from 'lucide-react';
import { StatCard } from '@/components/StatCard';

interface AnalyticsSummary {
  totalPageViews: number;
  totalJobViews: number;
  totalApplyClicks: number;
  conversionRate: number;
}

interface JobAnalytics {
  job_id: string;
  job_title: string;
  views: number;
  clicks: number;
  conversion_rate: number;
}

interface DailyStats {
  date: string;
  page_views: number;
  job_views: number;
  apply_clicks: number;
}

interface ReferrerStats {
  source: string;
  count: number;
  percentage: number;
}

interface ApplicationSourceStats {
  source: string;
  count: number;
  percentage: number;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted-foreground))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// Helper to extract source name from referrer URL
const parseReferrerSource = (referrer: string | null): string => {
  if (!referrer || referrer === '') return 'Direct';
  
  try {
    const url = new URL(referrer);
    const hostname = url.hostname.toLowerCase();
    
    // Known sources
    if (hostname.includes('google')) return 'Google';
    if (hostname.includes('facebook') || hostname.includes('fb.com')) return 'Facebook';
    if (hostname.includes('twitter') || hostname.includes('t.co') || hostname.includes('x.com')) return 'Twitter/X';
    if (hostname.includes('linkedin')) return 'LinkedIn';
    if (hostname.includes('instagram')) return 'Instagram';
    if (hostname.includes('youtube')) return 'YouTube';
    if (hostname.includes('tiktok')) return 'TikTok';
    if (hostname.includes('reddit')) return 'Reddit';
    if (hostname.includes('bing')) return 'Bing';
    if (hostname.includes('yahoo')) return 'Yahoo';
    if (hostname.includes('duckduckgo')) return 'DuckDuckGo';
    
    // Return domain for unknown sources
    return hostname.replace('www.', '');
  } catch {
    return 'Other';
  }
};

const AnalyticsDashboard = () => {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [jobAnalytics, setJobAnalytics] = useState<JobAnalytics[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [referrerStats, setReferrerStats] = useState<ReferrerStats[]>([]);
  const [applicationSourceStats, setApplicationSourceStats] = useState<ApplicationSourceStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    
    try {
      // Fetch all events
      const { data: events, error } = await supabase
        .from('analytics_events')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Calculate summary
      const pageViews = events?.filter(e => e.event_type === 'page_view').length || 0;
      const jobViews = events?.filter(e => e.event_type === 'job_view').length || 0;
      const applyClicks = events?.filter(e => e.event_type === 'apply_click').length || 0;
      
      setSummary({
        totalPageViews: pageViews,
        totalJobViews: jobViews,
        totalApplyClicks: applyClicks,
        conversionRate: jobViews > 0 ? Math.round((applyClicks / jobViews) * 100) : 0,
      });

      // Calculate per-job analytics
      const { data: jobs } = await supabase.from('jobs').select('id, title');
      const jobMap = new Map(jobs?.map(j => [j.id, j.title]) || []);

      const jobStats = new Map<string, { views: number; clicks: number }>();
      
      events?.forEach(event => {
        if (event.job_id && (event.event_type === 'job_view' || event.event_type === 'apply_click')) {
          if (!jobStats.has(event.job_id)) {
            jobStats.set(event.job_id, { views: 0, clicks: 0 });
          }
          const stats = jobStats.get(event.job_id)!;
          if (event.event_type === 'job_view') stats.views++;
          if (event.event_type === 'apply_click') stats.clicks++;
        }
      });

      const jobAnalyticsData: JobAnalytics[] = Array.from(jobStats.entries())
        .map(([jobId, stats]) => ({
          job_id: jobId,
          job_title: jobMap.get(jobId) || 'Unknown Job',
          views: stats.views,
          clicks: stats.clicks,
          conversion_rate: stats.views > 0 ? Math.round((stats.clicks / stats.views) * 100) : 0,
        }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10);

      setJobAnalytics(jobAnalyticsData);

      // Calculate daily stats (last 7 days)
      const now = new Date();
      const dailyData: DailyStats[] = [];
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const dayEvents = events?.filter(e => e.created_at.startsWith(dateStr)) || [];
        
        dailyData.push({
          date: date.toLocaleDateString('en-US', { weekday: 'short' }),
          page_views: dayEvents.filter(e => e.event_type === 'page_view').length,
          job_views: dayEvents.filter(e => e.event_type === 'job_view').length,
          apply_clicks: dayEvents.filter(e => e.event_type === 'apply_click').length,
        });
      }
      
      setDailyStats(dailyData);

      // Calculate referrer stats
      const referrerCounts = new Map<string, number>();
      const pageViewEvents = events?.filter(e => e.event_type === 'page_view') || [];
      
      pageViewEvents.forEach(event => {
        const source = parseReferrerSource(event.referrer);
        referrerCounts.set(source, (referrerCounts.get(source) || 0) + 1);
      });

      const totalReferrers = pageViewEvents.length;
      const referrerData: ReferrerStats[] = Array.from(referrerCounts.entries())
        .map(([source, count]) => ({
          source,
          count,
          percentage: totalReferrers > 0 ? Math.round((count / totalReferrers) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setReferrerStats(referrerData);

      // Fetch application source stats from applicants_prescreen
      const { data: applicants, error: applicantsError } = await supabase
        .from('applicants_prescreen')
        .select('job_source');

      if (!applicantsError && applicants) {
        const sourceCounts = new Map<string, number>();
        
        applicants.forEach(applicant => {
          let source = applicant.job_source || 'Not specified';
          // Normalize source names
          if (source.toLowerCase().startsWith('other:')) {
            source = source.substring(6).trim() || 'Other';
          }
          sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
        });

        const totalApplicants = applicants.length;
        const sourceData: ApplicationSourceStats[] = Array.from(sourceCounts.entries())
          .map(([source, count]) => ({
            source,
            count,
            percentage: totalApplicants > 0 ? Math.round((count / totalApplicants) * 100) : 0,
          }))
          .sort((a, b) => b.count - a.count);

        setApplicationSourceStats(sourceData);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  const pieData = [
    { name: 'Page Views', value: summary?.totalPageViews || 0 },
    { name: 'Job Views', value: summary?.totalJobViews || 0 },
    { name: 'Apply Clicks', value: summary?.totalApplyClicks || 0 },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
      
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard accent="cyan" icon={Eye} label="Page Views" value={summary?.totalPageViews || 0} />
        <StatCard accent="cyan" icon={FileText} label="Job Views" value={summary?.totalJobViews || 0} />
        <StatCard accent="cyan" icon={MousePointerClick} label="Apply Clicks" value={summary?.totalApplyClicks || 0} />
        <StatCard accent="cyan" icon={TrendingUp} label="Conversion Rate" value={`${summary?.conversionRate || 0}%`} />
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Daily Activity Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Last 7 Days Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="page_views" name="Page Views" fill="hsl(var(--primary))" />
                  <Bar dataKey="job_views" name="Job Views" fill="hsl(var(--secondary))" />
                  <Bar dataKey="apply_clicks" name="Apply Clicks" fill="hsl(var(--accent))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Event Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Event Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Traffic Sources */}
      {referrerStats.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Referrer Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Traffic Sources
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={referrerStats}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(props: any) => props.percentage > 5 ? `${props.source}: ${props.percentage}%` : ''}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="count"
                      nameKey="source"
                    >
                      {referrerStats.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number, name: string) => [`${value} visits`, name]}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Referrer Table */}
          <Card>
            <CardHeader>
              <CardTitle>Traffic Sources Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-4 font-medium">Source</th>
                      <th className="text-right py-2 px-4 font-medium">Visits</th>
                      <th className="text-right py-2 px-4 font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrerStats.map((referrer, index) => (
                      <tr key={referrer.source} className="border-b last:border-0">
                        <td className="py-2 px-4">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            {referrer.source}
                          </div>
                        </td>
                        <td className="text-right py-2 px-4">{referrer.count}</td>
                        <td className="text-right py-2 px-4">{referrer.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Application Sources */}
      {applicationSourceStats.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Application Source Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Where Applicants Applied From
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={applicationSourceStats}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(props: any) => props.percentage > 5 ? `${props.source}: ${props.percentage}%` : ''}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="count"
                      nameKey="source"
                    >
                      {applicationSourceStats.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number, name: string) => [`${value} applicants`, name]}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Application Source Table */}
          <Card>
            <CardHeader>
              <CardTitle>Application Sources Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-4 font-medium">Source</th>
                      <th className="text-right py-2 px-4 font-medium">Applicants</th>
                      <th className="text-right py-2 px-4 font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applicationSourceStats.map((source, index) => (
                      <tr key={source.source} className="border-b last:border-0">
                        <td className="py-2 px-4">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            {source.source}
                          </div>
                        </td>
                        <td className="text-right py-2 px-4">{source.count}</td>
                        <td className="text-right py-2 px-4">{source.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top Jobs Table */}
      {jobAnalytics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-4 font-medium">Job Title</th>
                    <th className="text-right py-2 px-4 font-medium">Views</th>
                    <th className="text-right py-2 px-4 font-medium">Clicks</th>
                    <th className="text-right py-2 px-4 font-medium">Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {jobAnalytics.map((job) => (
                    <tr key={job.job_id} className="border-b last:border-0">
                      <td className="py-2 px-4 truncate max-w-[300px]">{job.job_title}</td>
                      <td className="text-right py-2 px-4">{job.views}</td>
                      <td className="text-right py-2 px-4">{job.clicks}</td>
                      <td className="text-right py-2 px-4">{job.conversion_rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AnalyticsDashboard;
