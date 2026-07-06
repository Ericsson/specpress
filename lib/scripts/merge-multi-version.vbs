' merge-multi-version.vbs — Headless multi-version combination with tracked changes
' Usage: cscript //nologo merge-multi-version.vbs <outputPath> <v1.docx> <v2.docx> <author2> [<v3.docx> <author3> ...] [debug]
'
' Arguments:
'   0: outputPath (where to save final DOCX)
'   1: v1.docx (baseline version - no tracked changes)
'   2: v2.docx (second version)
'   3: author2 (author name for changes introduced by v2)
'   4: v3.docx (third version, optional)
'   5: author3 (author name for changes introduced by v3, optional)
'   ...
'   last: "debug" (optional) - if present, keeps temporary files for inspection
'
' Strategy: Work BACKWARDS from last version to first using MergeDocuments
' - Each iteration merges two documents: original (clean version) with revised (version with tracked changes)
' - BOTH OriginalAuthor and RevisedAuthor are set to ensure proper multi-author tracking
' - Example for 4 versions: merge v3+v4, then v2+(v3+v4), then v1+(v2+v3+v4)
' - This preserves all tracked changes with correct author attribution

Dim fso
Set fso = CreateObject("Scripting.FileSystemObject")

' ===== Helper Functions =====

' Convert relative path to absolute path if needed
Function ToAbsolutePath(path)
  If InStr(path, ":") > 0 Or Left(path, 2) = "\\" Then
    ToAbsolutePath = path
  Else
    ToAbsolutePath = fso.GetAbsolutePathName(path)
  End If
End Function

' Validate that a file exists, exit with error if not
Sub ValidateFileExists(path, logFile)
  Dim absPath
  absPath = ToAbsolutePath(path)
  If Not fso.FileExists(absPath) Then
    logFile.WriteLine "File not found: " & absPath
    logFile.Close
    WScript.Echo "File not found: " & absPath
    WScript.Quit 1
  End If
End Sub

' ===== Main Script =====

If WScript.Arguments.Count < 4 Then
  WScript.Echo "Usage: cscript //nologo merge-multi-version.vbs <outputPath> <v1.docx> <v2.docx> <author2> [<v3.docx> <author3> ...] [debug]"
  WScript.Echo "Error: At least 4 arguments required (outputPath, v1, v2, author2)"
  WScript.Quit 1
End If

' Check for debug mode (last argument = "debug")
Dim debugMode
debugMode = False
Dim lastArg
lastArg = WScript.Arguments(WScript.Arguments.Count - 1)
If LCase(lastArg) = "debug" Then
  debugMode = True
  WScript.Echo "Debug mode: ON (temporary files will be kept)"
End If

' Calculate effective argument count (excluding debug flag if present)
Dim effectiveArgCount
If debugMode Then
  effectiveArgCount = WScript.Arguments.Count - 1
Else
  effectiveArgCount = WScript.Arguments.Count
End If

' Check that we have an even number of effective arguments (outputPath + v1 + pairs of version+author)
If (effectiveArgCount Mod 2) <> 0 Then
  WScript.Echo "Error: Invalid number of arguments. Expected format:"
  WScript.Echo "  <outputPath> <v1.docx> <v2.docx> <author2> [<v3.docx> <author3> ...] [debug]"
  WScript.Echo "Got " & effectiveArgCount & " arguments (should be even number)"
  WScript.Quit 1
End If

Dim outputPath
outputPath = ToAbsolutePath(WScript.Arguments(0))

' Create log file
Dim logFile, logPath
logPath = fso.GetSpecialFolder(2) & "\specpress_merge_debug.log"
Set logFile = fso.CreateTextFile(logPath, True)
logFile.WriteLine "=== SpecPress Merge Debug Log ==="
logFile.WriteLine "Start time: " & Now
logFile.WriteLine "Arguments count: " & WScript.Arguments.Count
Dim argIdx
For argIdx = 0 To WScript.Arguments.Count - 1
  logFile.WriteLine "  Arg[" & argIdx & "]: " & WScript.Arguments(argIdx)
Next
Dim logLine

' Validate all input DOCX files exist
Dim i
ValidateFileExists WScript.Arguments(1), logFile  ' v1
ValidateFileExists WScript.Arguments(2), logFile  ' v2
For i = 4 To effectiveArgCount - 1 Step 2
  ValidateFileExists WScript.Arguments(i), logFile  ' v3, v4, v5...
Next

' Create Word application (invisible)
Dim wordApp
Set wordApp = CreateObject("Word.Application")
wordApp.Visible = False
wordApp.DisplayAlerts = 0 ' wdAlertsNone = 0
wordApp.ScreenUpdating = False
wordApp.Options.UpdateFieldsAtPrint = False
wordApp.Options.UpdateLinksAtPrint = False
wordApp.Options.UpdateLinksAtOpen = False
wordApp.Options.WarnBeforeSavingPrintingSendingMarkup = False
wordApp.Options.SavePropertiesPrompt = False
wordApp.Options.ConfirmConversions = False

On Error Resume Next

logLine = "Processing " & effectiveArgCount / 2 & " versions using backward merge strategy..."
WScript.Echo logLine
logFile.WriteLine logLine

Dim origPath, origAuthor, origVersionNumber, origDoc
Dim revisedPath, revisedAuthor, revisedVersionNumber, revisedDoc

' Temp file for saving intermediate results
Dim tempResultPath
tempResultPath = ""

' Work backwards: merge each version with the accumulated result
Dim revisedVersionIndex  ' Zero-based position of the input parameter specifying the path of a version.
revisedVersionIndex = effectiveArgCount - 2 ' Start with last version

Dim resultDoc
Set resultDoc = Nothing

Do While revisedVersionIndex >= 2

  If tempResultPath = "" Then
    revisedPath = ToAbsolutePath(WScript.Arguments(revisedVersionIndex))
  Else
    revisedPath = tempResultPath
  End If
  revisedAuthor = WScript.Arguments(revisedVersionIndex + 1)
  revisedVersionNumber = (revisedVersionIndex + 2) \ 2

  If revisedVersionIndex >= 4 Then
    origPath = ToAbsolutePath(WScript.Arguments(revisedVersionIndex - 2))
    origAuthor = WScript.Arguments(revisedVersionIndex - 1)
  Else
    origPath = ToAbsolutePath(WScript.Arguments(1))
    origAuthor = "Base Version"
  End If
  origVersionNumber = revisedVersionNumber - 1

  tempResultPath = fso.GetSpecialFolder(2) & "\specpress_merged_v" & origVersionNumber & "-" & revisedVersionNumber & ".docx"

  logLine = "Merging v" & origVersionNumber & " (original, author: " & origAuthor & ", file: " & origPath & ")" & vbNewLine & _
               "   with v" & revisedVersionNumber & " (revised, author: " & revisedAuthor & ", file: " & revisedPath & ") " & vbNewLine & _
               "   into " & tempResultPath
  WScript.Echo logLine
  logFile.WriteLine logLine

  Set origDoc = wordApp.Documents.Open(origPath)
  If Err.Number <> 0 Then
    WScript.Echo "Failed to open v" & origVersionNumber & ": " & Err.Description
    wordApp.Quit 0
    WScript.Quit 1
  End If

  Set revisedDoc = wordApp.Documents.Open(revisedPath)
  If Err.Number <> 0 Then
    WScript.Echo "Failed to open v" & revisedVersionNumber & ": " & Err.Description
    origDoc.Close 0
    wordApp.Quit 0
    WScript.Quit 1
  End If

  Err.Clear
  wordApp.DisplayAlerts = 0

  Set resultDoc = wordApp.MergeDocuments(origDoc, revisedDoc, 2, 0, True, True, True, True, True, True, True, True, True, True, origAuthor, revisedAuthor, 0)


  If Err.Number <> 0 Then
    WScript.Echo "Merge failed: " & Err.Description
    origDoc.Close 0
    revisedDoc.Close 0
    wordApp.Quit 0
    WScript.Quit 1
  End If

  origDoc.Close 0
  revisedDoc.Close 0


  If fso.FileExists(tempResultPath) Then fso.DeleteFile tempResultPath
  resultDoc.SaveAs2 tempResultPath, 16

  logLine = "   -> Merge complete."
  WScript.Echo logLine
  logFile.WriteLine logLine

  revisedVersionIndex = revisedVersionIndex - 2

Loop

' Save the result to the specified output path
resultDoc.SaveAs2 outputPath

If Err.Number <> 0 Then
  WScript.Echo "Save failed: " & Err.Description
  resultDoc.Close 0
  wordApp.Quit 0
  WScript.Quit 1
End If

' Close and quit
resultDoc.Close 0

' Clean up temp files (unless in debug mode)
If Not debugMode Then
  If fso.FileExists(tempResultPath) Then
    fso.DeleteFile tempResultPath
    WScript.Echo "Cleaned up temporary file: " & tempResultPath
  End If

  ' Clean up all intermediate merge files
  Dim tempFile
  For i = 1 To effectiveArgCount \ 2 - 1
    tempFile = fso.GetSpecialFolder(2) & "\specpress_merged_v" & i & "-" & (i + 1) & ".docx"
    If fso.FileExists(tempFile) Then
      fso.DeleteFile tempFile
      WScript.Echo "Cleaned up temporary file: " & tempFile
    End If
  Next
Else
  WScript.Echo "Debug mode: Keeping temporary files"
  WScript.Echo "  Last temp file: " & tempResultPath
End If
wordApp.Quit 0

If Err.Number <> 0 Then
  WScript.Echo "Cleanup failed: " & Err.Description
  WScript.Quit 1
End If

logFile.WriteLine "End time: " & Now
logFile.WriteLine "Final output: " & outputPath
logFile.WriteLine "=== End Log ==="
logFile.Close

Set resultDoc = Nothing
Set wordApp = Nothing
Set logFile = Nothing
Set fso = Nothing

WScript.Echo "Success"
WScript.Echo "Debug log written to: " & logPath
