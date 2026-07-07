"""
Merge two DOCX files into a tracked-changes document using LibreOffice UNO API.

Usage (invoked by docxMerge.js via LibreOffice's bundled Python):
  python merge_tracked_changes.py <base.docx> <revision.docx> <output.docx> <authorName> [<sofficePath>]

The script starts a headless LibreOffice instance with a temporary user profile
(to set the tracked-changes author), opens the base document, compares it
against the revision document, and saves the result.
"""
import sys
import os
import subprocess
import time
import shutil
import tempfile

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

def create_temp_profile(author_name):
    """Create a temporary LibreOffice user profile with the author name pre-set."""
    profile_dir = tempfile.mkdtemp(prefix='specpress_lo_')
    user_dir = os.path.join(profile_dir, 'user')
    os.makedirs(user_dir, exist_ok=True)

    # Write registrymodifications.xcu with the author name
    xcu_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.UserProfile/Data"><prop oor:name="givenname" oor:op="fuse"><value>{author_name}</value></prop></item>
<item oor:path="/org.openoffice.UserProfile/Data"><prop oor:name="sn" oor:op="fuse"><value></value></prop></item>
<item oor:path="/org.openoffice.UserProfile/Data"><prop oor:name="initials" oor:op="fuse"><value>{author_name[:2] if author_name else "SP"}</value></prop></item>
</oor:items>
'''
    xcu_path = os.path.join(user_dir, 'registrymodifications.xcu')
    with open(xcu_path, 'w', encoding='utf-8') as f:
        f.write(xcu_content)

    return profile_dir

def start_libreoffice(soffice_path, pipe_name, profile_url):
    """Start a headless LibreOffice instance with a custom profile listening on a named pipe."""
    args = [
        soffice_path,
        '--headless',
        '--invisible',
        '--nocrashreport',
        '--nodefault',
        '--nologo',
        '--nofirststartwizard',
        '--norestore',
        f'-env:UserInstallation={profile_url}',
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

    # Create a temporary profile with the author name pre-configured
    profile_dir = create_temp_profile(author_name)
    profile_url = to_url(profile_dir)

    pipe_name = f'specpress_merge_{os.getpid()}'
    soffice_path = find_soffice()
    print(f'Starting LibreOffice: {soffice_path}', file=sys.stderr)
    print(f'Pipe name: {pipe_name}', file=sys.stderr)
    lo_proc = start_libreoffice(soffice_path, pipe_name, profile_url)
    print(f'LibreOffice PID: {lo_proc.pid}', file=sys.stderr)

    try:
        print('Connecting to LibreOffice...', file=sys.stderr)
        ctx = connect_to_libreoffice(pipe_name)
        print('Connected.', file=sys.stderr)
        smgr = ctx.ServiceManager
        desktop = smgr.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)

        # Open base document
        base_url = to_url(base_path)
        load_props = (
            PropertyValue('Hidden', 0, True, 0),
            PropertyValue('ReadOnly', 0, False, 0),
        )
        print(f'Opening base document: {base_path}', file=sys.stderr)
        base_doc = desktop.loadComponentFromURL(base_url, '_blank', 0, load_props)
        if base_doc is None:
            print(f'Failed to open base document: {base_path}', file=sys.stderr)
            sys.exit(1)
        print('Base document opened.', file=sys.stderr)

        # Compare with revision document
        revision_url = to_url(revision_path)
        dispatch_helper = smgr.createInstanceWithContext(
            'com.sun.star.frame.DispatchHelper', ctx)

        print(f'Comparing with revision: {revision_path}', file=sys.stderr)
        compare_props = (PropertyValue('URL', 0, revision_url, 0),)
        dispatch_helper.executeDispatch(
            base_doc.getCurrentController().getFrame(),
            '.uno:CompareDocuments', '', 0, compare_props)
        print('Comparison complete.', file=sys.stderr)

        # Save as output
        output_url = to_url(output_path)
        save_props = (
            PropertyValue('FilterName', 0, 'MS Word 2007 XML', 0),
            PropertyValue('Overwrite', 0, True, 0),
        )
        print(f'Saving to: {output_path}', file=sys.stderr)
        base_doc.storeToURL(output_url, save_props)
        base_doc.close(True)
        print('Save complete.', file=sys.stderr)

        print('Success')

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
        # Clean up temporary profile
        try:
            shutil.rmtree(profile_dir, ignore_errors=True)
        except Exception:
            pass

if __name__ == '__main__':
    main()
