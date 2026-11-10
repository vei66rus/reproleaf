#requires -Version 7.0
$ErrorActionPreference='Stop'
$sourceScript=Join-Path $PSScriptRoot '../tools/package-local-preview.ps1'
$tempBase=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$name='reproleaf-export-guards-'+[Guid]::NewGuid().ToString('N')
$tempPath=[IO.Path]::GetFullPath((Join-Path $tempBase $name))
$fixtureRoot=Join-Path $tempPath 'fixture'
$checks=0
function Assert-Export([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message};$script:checks++}
function Assert-Rejected([scriptblock]$Call,[string]$MessagePattern){
  $caught=$null;try{& $Call | Out-Null}catch{$caught=$_}
  Assert-Export ($null -ne $caught -and $caught.Exception.Message -match $MessagePattern) ('Expected rejection: '+$MessagePattern)
}
try{
  New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
  foreach($relative in @('README.md','CONTRIBUTING.md','SECURITY.md','CHANGELOG.md','LICENSE','CITATION.cff','.dockerignore','deploy/public-gateway/Dockerfile','deploy/public-gateway/compose.yaml','deploy/public-gateway/launch.mjs','deploy/public-gateway/Caddyfile.example','.gitignore','.env.example','package.json','package-lock.json','docs/SITE-CONTEXT.md','docs/PROJECT-CONTEXT.md','docs/PARAGRAPH-REVIEW.md','docs/PUBLIC-GATEWAY.md','.github/workflows/ci.yml')){
    $file=Join-Path $fixtureRoot $relative;New-Item -ItemType Directory -Path (Split-Path -Parent $file) -Force | Out-Null
    [IO.File]::WriteAllText($file,($relative -eq '.gitignore' ? ".env`nprivate/`nartifacts/`n" : 'Public test fixture.'))
  }
  foreach($directory in @('tools','src','cases','fixtures','skills','packs','examples','tests','integrations')){New-Item -ItemType Directory -Path (Join-Path $fixtureRoot $directory) -Force | Out-Null}
  $fixtureScript=Join-Path $fixtureRoot 'tools/package-local-preview.ps1';Copy-Item -LiteralPath $sourceScript -Destination $fixtureScript
  [IO.File]::WriteAllText((Join-Path $fixtureRoot 'src/example.mjs'),'export const fixture=true;')
  [IO.File]::WriteAllText((Join-Path $fixtureRoot '.env'),'Ignored private fixture.')
  New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'private') -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $fixtureRoot 'private/record.txt'),'Ignored private fixture.')
  $zipPath=Join-Path $tempPath 'new-source.zip'
  $preview=(& $fixtureScript -Destination $zipPath -DryRun) | ConvertFrom-Json
  Assert-Export ($preview.DryRun -and $preview.Entries -contains '.gitignore' -and $preview.Entries -contains '.env.example') 'Source preview must include ignore rules and the empty environment template'
  Assert-Export ($preview.Entries -contains '.github/workflows/ci.yml') 'Only the reviewed standalone CI workflow must be included explicitly'
  Assert-Export ($preview.Entries -contains 'docs/PARAGRAPH-REVIEW.md' -and $preview.Entries -contains 'docs/PUBLIC-GATEWAY.md' -and $preview.Entries -contains 'CITATION.cff') 'Research/gateway limitations and citation metadata must be included in source review'
  Assert-Export (-not (Test-Path -LiteralPath $zipPath)) 'Dry run must not create an archive'
  Assert-Export (@($preview.Entries | Where-Object { $_ -eq '.env' -or $_ -like 'private/*' }).Count -eq 0) 'Private root data must not enter the preview'
  $created=(& $fixtureScript -Destination $zipPath) | ConvertFrom-Json
  Assert-Export ($created.Files -eq $preview.Files -and (Test-Path -LiteralPath $zipPath)) 'Fresh export must match its preflight inventory'
  $archive=[IO.Compression.ZipFile]::OpenRead($zipPath)
  try{Assert-Export (@($archive.Entries.FullName) -contains '.gitignore') 'The created archive must retain ignore rules'}finally{$archive.Dispose()}
  $originalHash=(Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
  Assert-Rejected {& $fixtureScript -Destination $zipPath} 'already exists'
  Assert-Export ((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash -eq $originalHash) 'Rejected overwrite must preserve the original archive bytes'
  Assert-Rejected {& $fixtureScript -Destination (Join-Path $fixtureRoot 'src/self.zip')} 'outside included source'
  New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'src/private') -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $fixtureRoot 'src/private/not-public.txt'),'Private path fixture.')
  $deniedPath=Join-Path $tempPath 'denied.zip'
  Assert-Rejected {& $fixtureScript -Destination $deniedPath} 'Private path'
  Assert-Export (-not (Test-Path -LiteralPath $deniedPath)) 'A private source entry must fail before archive creation'
  Write-Output ('Export guards passed: '+$checks+'. Only disposable fixtures and a fresh temporary ZIP were used.')
}finally{
  $resolved=[IO.Path]::GetFullPath($tempPath)
  if($resolved -eq [IO.Path]::GetFullPath((Join-Path $tempBase $name)) -and (Split-Path $resolved -Leaf) -match '^reproleaf-export-guards-[a-f0-9]{32}$'){
    if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force}
  }else{throw 'Temporary cleanup target validation failed'}
}
