const fs = require('fs');

let code = fs.readFileSync('src/components/IntunePackager.tsx', 'utf8');

code = code.replace(
  /<div className="space-y-4">\n                <label className="relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700\/50 cursor-pointer transition-colors">\n                  <div className="flex flex-col items-center justify-center pt-5 pb-6">\n                    <UploadCloud className="w-8 h-8 mb-3 text-slate-400" \/>\n                    <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">\n                      <span className="font-semibold">Click to upload files<\/span>\n                    <\/p>\n                    <p className="text-xs text-slate-500 dark:text-slate-400">Select one or multiple files<\/p>\n                  <\/div>\n                  <input type="file" multiple className="hidden" onChange=\{handleFilesUpload\} ref=\{fileInputRef\} \/>\n                <\/label>/m,
  `<div className="space-y-4">
                {!electronAvailable && (
                  <label className="relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <UploadCloud className="w-8 h-8 mb-3 text-slate-400" />
                      <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
                        <span className="font-semibold">Click to upload files</span>
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Select one or multiple files</p>
                    </div>
                    <input type="file" multiple className="hidden" onChange={handleFilesUpload} ref={fileInputRef} />
                  </label>
                )}`
);


// And we also want to remove the `OR` block in electronAvailable since the drag-and-drop is gone
code = code.replace(
  /<div className="text-center text-xs text-slate-400">OR<\/div>/,
  ``
);

fs.writeFileSync('src/components/IntunePackager.tsx', code);
