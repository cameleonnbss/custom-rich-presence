# Diagnostic: list Discord IPC pipes.
$files = [System.IO.Directory]::GetFiles('\\.\pipe\')
$files | Where-Object { $_ -like '*discord*' } | ForEach-Object { $_ }
