"""
Merge two DOCX files into a tracked-changes document using LibreOffice UNO API.

Usage (invoked by docxMerge.js via soffice --headless --python):
  soffice --headless --invisible --python merge_tracked_changes.py <base.docx> <revision.docx> <output.docx> <authorName>

The script opens the base document, compares it against the revision document,
and saves the result with tracked changes attributed to the given author.
"""
import sys
import os

def to_url(filepath):
    """Convert a filesystem path to a file:// URL for UNO."""
    abspath = os.path.abspath(filepath)
    if sys.platform == 'win32':
        return 'file:///' + abspath.replace('\\', '/')
    return 'file://' + abspath

def main():
    if len(sys.argv) < 5:
        print('Usage: merge_tracked_changes.py <base.docx> <revision.docx> <output.docx> <authorName>', file=sys.stderr)
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

    localContext = uno.getComponentContext()
    smgr = localContext.ServiceManager

    desktop = smgr.createInstanceWithContext(
        'com.sun.star.frame.Desktop', localContext)

    # Set redline author via user profile configuration
    config_access = None
    orig_first = None
    orig_last = None
    config_provider = smgr.createInstanceWithContext(
        'com.sun.star.configuration.ConfigurationProvider', localContext)
    if config_provider is not None:
        try:
            config_args = (PropertyValue('nodepath', 0, '/org.openoffice.UserProfile/Data', 0),)
            config_access = config_provider.createInstanceWithArguments(
                'com.sun.star.configuration.ConfigurationUpdateAccess', config_args)
            orig_first = config_access.getByName('givenname')
            orig_last = config_access.getByName('sn')
            config_access.replaceByName('givenname', author_name)
            config_access.replaceByName('sn', '')
            config_access.commitChanges()
        except Exception as e:
            print(f'Warning: Could not set author via config: {e}', file=sys.stderr)
            config_access = None

    try:
        # Open base document
        base_url = to_url(base_path)
        load_props = (
            PropertyValue('Hidden', 0, True, 0),
            PropertyValue('ReadOnly', 0, False, 0),
        )
        base_doc = desktop.loadComponentFromURL(base_url, '_blank', 0, load_props)
        if base_doc is None:
            print(f'Failed to open base document: {base_path}', file=sys.stderr)
            sys.exit(1)

        # If config-based author setting failed, try document-level redline settings
        if config_access is None:
            try:
                settings = base_doc.getPropertyValue('RedlineProtectionKey')
            except Exception:
                pass  # Not all versions support this; comparison will use default author

        # Compare with revision document using XCompareDocumentDispatch
        revision_url = to_url(revision_path)
        dispatch_helper = smgr.createInstanceWithContext(
            'com.sun.star.frame.DispatchHelper', localContext)

        compare_props = (PropertyValue('URL', 0, revision_url, 0),)
        dispatch_helper.executeDispatch(
            base_doc.getCurrentController().getFrame(),
            '.uno:CompareDocuments', '', 0, compare_props)

        # Save as output
        output_url = to_url(output_path)
        save_props = (
            PropertyValue('FilterName', 0, 'MS Word 2007 XML', 0),
            PropertyValue('Overwrite', 0, True, 0),
        )
        base_doc.storeToURL(output_url, save_props)
        base_doc.close(True)

        print('Success')

    finally:
        # Restore original user profile if we changed it
        if config_access is not None:
            try:
                config_access.replaceByName('givenname', orig_first)
                config_access.replaceByName('sn', orig_last)
                config_access.commitChanges()
            except Exception:
                pass

if __name__ == '__main__':
    main()
