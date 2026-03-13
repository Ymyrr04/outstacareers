UPDATE scheduled_contractor_emails 
SET status = 'sent', sent_at = now(), error_message = 'cancelled - duplicate from spam bug'
WHERE id = '3f37e4d8-d8d8-4dca-975b-5347590394f5' AND status = 'processing';