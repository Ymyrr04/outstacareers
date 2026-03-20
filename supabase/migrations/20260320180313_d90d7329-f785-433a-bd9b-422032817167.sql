
UPDATE scheduled_contractor_emails 
SET status = 'failed', error_message = 'Manually stopped by admin' 
WHERE id = 'd56dbc4e-cba3-451f-8e94-395aca6d3a8b' AND status = 'processing';

SELECT cron.unschedule(9);
