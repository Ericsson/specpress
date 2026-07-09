"""
Merge two DOCX files into a tracked-changes document using LibreOffice UNO API.

Usage (invoked by docxMerge.js via LibreOffice's bundled Python):
  python merge_tracked_changes.py <base.docx> <revision.docx> <output.docx> <authorName> [<sofficePath>]

The script starts a headless LibreOffice instance, opens the base document,
compares it against the revision document, saves the result, then post-processes
the DOCX to set the tracked-changes author name.
"""
import sys
import os
import subprocess
import time
import tempfile
import shutil
import zipfile

def to_url(filepath):
    """Convert a filesystem path to a file:// URL for UNO."""
    abspath = os.path.abspath(filepath)
    if sys.platform == 'win32':
        return 'file:///' + abspath.replace('\\', '/')
    return 'file://' + abspath

def find_soffice():
    """Find soffice executable from environment or common paths."""
    if len(sys.argv) > 5:
        return sys.argv[5]
    uno_path = os.environ.get('UNO_PATH', '')
    if uno_path:
        candidate = os.path.join(uno_path, 'soffice.exe' if sys.platform == 'win32' else 'soffice')
        if os.path.isfile(candidate):
            return candidate
    return 'soffice'

def start_libreoffice(soffice_path, pipe_name):
    """Start a headless LibreOffice instance listening on a named pipe."""
    args = [
        soffice_path,
        '--headless',
        '--invisible',
        '--nocrashreport',
        '--nodefault',
        '--nologo',
        '--nofirststartwizard',
        '--norestore',
        f'--accept=pipe,name={pipe_name};urp;StarOffice.ComponentContext'
    ]
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return proc

def connect_to_libreoffice(pipe_name, timeout=30):
    """Connect to a running LibreOffice instance via named pipe."""
    import uno
    from com.sun.star.connection import NoConnectException

    localContext = uno.getComponentContext()
    resolver = localContext.ServiceManager.createInstanceWithContext(
        'com.sun.star.bridge.UnoUrlResolver', localContext)

    connect_str = f'uno:pipe,name={pipe_name};urp;StarOffice.ComponentContext'
    deadline = time.time() + timeout
    ctx = None
    while time.time() < deadline:
        try:
            ctx = resolver.resolve(connect_str)
            break
        except NoConnectException:
            time.sleep(0.5)

    if ctx is None:
        raise RuntimeError(f'Could not connect to LibreOffice within {timeout}s')
    return ctx

def fix_docx_author(docx_path, author_name):
    """Post-process a DOCX file to replace all tracked-change author names."""
    # DOCX is a ZIP containing XML files. Tracked changes use w:author attributes
    # in word/document.xml (and possibly word/footnotes.xml, word/endnotes.xml).
    # Use regex replacement to avoid XML re-serialisation which mangles namespaces.
    import re
    tmp_path = docx_path + '.tmp'
    author_re = re.compile(rb'(\bw:author=")[^"]*"')
    escaped = author_name.replace('&', '&amp;').replace('<', '&lt;').replace('"', '&quot;')
    replacement = rb'\g<1>' + escaped.encode('utf-8') + b'"'
    count = 0

    with zipfile.ZipFile(docx_path, 'r') as zin, zipfile.ZipFile(tmp_path, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename.startswith('word/') and item.filename.endswith('.xml'):
                new_data, n = author_re.subn(replacement, data)
                if n > 0:
                    data = new_data
                    count += n
            zout.writestr(item, data)

    os.replace(tmp_path, docx_path)
    return count

def main():
    if len(sys.argv) < 5:
        print('Usage: merge_tracked_changes.py <base.docx> <revision.docx> <output.docx> <authorName> [<sofficePath>]', file=sys.stderr)
        sys.exit(1)

    base_path = sys.argv[1]
    revision_path = sys.argv[2]
    output_path = sys.argv[3]
    author_name = sys.argv[4]

    for f in (base_path, revision_path):
        if not os.path.isfile(f):
            print(f'File not found: {f}', file=sys.stderr)
            sys.exit(1)

    import uno
    from com.sun.star.beans import PropertyValue

    pipe_name = f'specpress_merge_{os.getpid()}'
    soffice_path = find_soffice()
    print(f'Starting LibreOffice: {soffice_path}', file=sys.stderr)
    print(f'Pipe name: {pipe_name}', file=sys.stderr)
    lo_proc = start_libreoffice(soffice_path, pipe_name)
    print(f'LibreOffice PID: {lo_proc.pid}', file=sys.stderr)

    try:
        print('Connecting to LibreOffice...', file=sys.stderr)
        ctx = connect_to_libreoffice(pipe_name)
        print('Connected.', file=sys.stderr)
        smgr = ctx.ServiceManager
        desktop = smgr.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)

        # Open revision (new) document — we open the newer version and compare
        # against the base so that insertions/deletions are correctly oriented.
        revision_url = to_url(revision_path)
        load_props = (
            PropertyValue('Hidden', 0, True, 0),
            PropertyValue('ReadOnly', 0, False, 0),
        )
        print(f'Opening revision document: {revision_path}', file=sys.stderr)
        doc = desktop.loadComponentFromURL(revision_url, '_blank', 0, load_props)
        if doc is None:
            print(f'Failed to open revision document: {revision_path}', file=sys.stderr)
            sys.exit(1)
        print('Revision document opened.', file=sys.stderr)

        # Compare against base (old) document
        base_url = to_url(base_path)
        dispatch_helper = smgr.createInstanceWithContext(
            'com.sun.star.frame.DispatchHelper', ctx)

        print(f'Comparing against base: {base_path}', file=sys.stderr)
        compare_props = (PropertyValue('URL', 0, base_url, 0),)
        dispatch_helper.executeDispatch(
            doc.getCurrentController().getFrame(),
            '.uno:CompareDocuments', '', 0, compare_props)
        print('Comparison complete.', file=sys.stderr)

        # Save as output
        output_url = to_url(output_path)
        save_props = (
            PropertyValue('FilterName', 0, 'MS Word 2007 XML', 0),
            PropertyValue('Overwrite', 0, True, 0),
        )
        print(f'Saving to: {output_path}', file=sys.stderr)
        doc.storeToURL(output_url, save_props)
        doc.close(True)
        print('Save complete.', file=sys.stderr)

    finally:
        # Terminate the LibreOffice process tree
        try:
            if sys.platform == 'win32':
                subprocess.call(['taskkill', '/F', '/T', '/PID', str(lo_proc.pid)],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                lo_proc.terminate()
                lo_proc.wait(timeout=10)
        except Exception:
            try:
                lo_proc.kill()
            except Exception:
                pass

    # Post-process the DOCX to set the correct author name on all tracked changes
    print(f'Setting author to: {author_name}', file=sys.stderr)
    count = fix_docx_author(output_path, author_name)
    print(f'Updated {count} tracked-change entries.', file=sys.stderr)

    print('Success')

if __name__ == '__main__':
    main()
