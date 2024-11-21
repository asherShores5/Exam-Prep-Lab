# sync-to-s3.ps1

# Load environment variables from .env file
Get-Content .env | ForEach-Object {
    $name, $value = $_.split('=')
    if ($name -and $value) {
        Set-Item -Path "env:$name" -Value $value
    }
}

Write-Host "Building project..." -ForegroundColor Green
# npm run build

if ($LASTEXITCODE -eq 1) {
    Write-Host "Build successful! Syncing to S3..." -ForegroundColor Green
    
    # Sync dist folder with S3 bucket
    aws s3 sync dist/ s3://$env:BUCKET_NAME --delete

    if ($LASTEXITCODE -eq 0) {
        Write-Host "Successfully synced to S3!" -ForegroundColor Green
        Write-Host "Website URL: http://$env:BUCKET_NAME.s3-website-$env:AWS_DEFAULT_REGION.amazonaws.com" -ForegroundColor Cyan
    } else {
        Write-Host "Error syncing to S3" -ForegroundColor Red
    }
} else {
    Write-Host "Build failed!" -ForegroundColor Red
}

# Clear AWS credentials from environment for security
Remove-Item Env:AWS_ACCESS_KEY_ID
Remove-Item Env:AWS_SECRET_ACCESS_KEY