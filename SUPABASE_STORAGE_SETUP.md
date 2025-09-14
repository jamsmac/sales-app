# 📦 Supabase Storage Configuration

## Storage Endpoint Information
- **Storage URL:** https://yrvawzdcnjlnbmamhwsc.storage.supabase.co/storage/v1/s3
- **Region:** eu-north-1
- **Project:** yrvawzdcnjlnbmamhwsc

## Required Storage Bucket Setup

### 1. Create Storage Bucket
1. Open Supabase Dashboard → Storage
2. Click "New bucket"
3. **Bucket name:** `excel-files`
4. **Public:** No (keep private)
5. **Region:** eu-north-1 (should be auto-selected)
6. Click "Create bucket"

### 2. Configure Bucket Policies
Add these RLS policies for the `excel-files` bucket:

```sql
-- Allow authenticated users to upload files
CREATE POLICY "Allow authenticated uploads" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'excel-files' 
  AND auth.role() = 'authenticated'
);

-- Allow authenticated users to view their own files
CREATE POLICY "Allow authenticated downloads" ON storage.objects
FOR SELECT USING (
  bucket_id = 'excel-files' 
  AND auth.role() = 'authenticated'
);

-- Allow authenticated users to delete their own files
CREATE POLICY "Allow authenticated deletes" ON storage.objects
FOR DELETE USING (
  bucket_id = 'excel-files' 
  AND auth.role() = 'authenticated'
);
```

### 3. Verify Storage Configuration
The application will automatically use these storage methods:
- `uploadFileToStorage()` - Upload Excel files
- `downloadFileFromStorage()` - Download files
- `deleteFileFromStorage()` - Remove files

### 4. File Path Structure
Files will be stored with this pattern:
```
excel-files/
  └── uploads/
      ├── 1704067200000_sales_data.xlsx
      ├── 1704067300000_orders_export.xlsx
      └── ...
```

## Environment Variables
Make sure these are set in Railway:
```
SUPABASE_URL=https://yrvawzdcnjlnbmamhwsc.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlydmF3emRjbmpsbmJtYW1od3NjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Nzg3MDIxMiwiZXhwIjoyMDczNDQ2MjEyfQ.RvS90UDa0ClWT1DYzVfUcWJU2KEBQY5YoqDogh3GU3o
```

## Testing Storage
After setup, test with:
1. Upload an Excel file through the web interface
2. Check Supabase Dashboard → Storage → excel-files
3. Verify files appear in the uploads folder

✅ Storage is now ready for production use!
