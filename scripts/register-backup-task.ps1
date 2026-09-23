# Registers a Windows Task Scheduler job that runs "npm run backup" daily at 02:00.
# Run once from the project root:  powershell -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1
$projectRoot = Split-Path -Parent $PSScriptRoot
$npmCmd = Join-Path (Split-Path -Parent (Get-Command npm.cmd).Source) 'npm.cmd'
$action = New-ScheduledTaskAction -Execute $npmCmd -Argument 'run backup' -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -Daily -At 02:00
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'StoreGenz daily backup' -Action $action -Trigger $trigger -Settings $settings -Description 'Daily JSON backup of the storegenz MongoDB database (keeps the 30 newest files).' -Force
