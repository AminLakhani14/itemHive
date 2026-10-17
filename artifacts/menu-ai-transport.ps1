param([string]$RequestUrl)
$ErrorActionPreference = 'Stop'
$menuRequest = [Console]::In.ReadToEnd() | ConvertFrom-Json
try {
    $menuResponse = Invoke-WebRequest -Uri $RequestUrl -Method Post -UseBasicParsing -Headers @{ 'x-goog-api-key' = $menuRequest.key } -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($menuRequest.body)) -TimeoutSec 40
    @{ status = [int]$menuResponse.StatusCode; body = $menuResponse.Content } | ConvertTo-Json -Compress
} catch {
    if ($_.Exception.Response) { @{ status = [int]$_.Exception.Response.StatusCode; body = $_.ErrorDetails.Message } | ConvertTo-Json -Compress }
    else { Write-Error 'Unable to reach Google AI'; exit 1 }
}
