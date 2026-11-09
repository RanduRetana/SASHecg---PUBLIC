import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

export function PrivacyDialog() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button type="button" variant="ghost" size="sm">
            How it works & privacy
          </Button>
        }
      />
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>How it works</DialogTitle>
          <DialogDescription>
            Your PDFs never leave your computer. SASHecg does all the work inside this browser tab, using your own
            computer’s processor and memory.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 text-[13px] leading-relaxed text-fg-2">
          <section className="grid gap-1">
            <h3 className="text-[13px] font-medium text-fg">Your files stay with you</h3>
            <p>
              When you open a PDF, the browser reads it locally. SASHecg has no server that receives files, no accounts,
              no database, and no analytics. The PDF, its password, and the processed pages are not uploaded or stored
              anywhere by this app. The website only delivers the app itself; after that, everything happens on your
              machine.
            </p>
            <p>
              Closing or reloading the tab clears everything SASHecg was holding. The ZIP you download is saved only to
              your own downloads folder. Because the work happens on your computer, a slower or busy machine will take
              longer. A current Chrome, Edge, Firefox, or Safari works best.
            </p>
          </section>
          <section className="grid gap-1">
            <h3 className="text-[13px] font-medium text-fg">What happens to each page</h3>
            <p>
              SASHecg uses well-known open-source libraries, all running in your browser: PDF.js (from Mozilla) draws
              each page as an image, the areas you marked are painted over with solid blocks, pdf-lib saves each page as
              a new PDF containing only that image, and fflate packs them into a ZIP.
            </p>
            <p>
              Because the new PDF is just a flat image, the original text is not copied into it. What was under a block
              is replaced, not hidden, so it cannot be selected, copied, or uncovered later. Only the areas you mark are
              covered, so check every page before sharing.
            </p>
          </section>
          <section className="grid gap-1">
            <h3 className="text-[13px] font-medium text-fg">Study codes</h3>
            <p>
              A study code is optional. When you turn it on, you type one code and it is added on top of the covered
              area on every page of every PDF in the current batch. Opening new files, or choosing New file, clears the
              code and turns the option off, so the next code (for example 8805-002 after 8805-001) has to be typed
              again. SASHecg keeps the code exactly as typed, including leading zeros.
            </p>
          </section>
          <section className="grid gap-1">
            <h3 className="text-[13px] font-medium text-fg">Fully transparent</h3>
            <p>
              The complete source code is public on{' '}
              <a
                className="font-medium text-fg underline underline-offset-2"
                href="https://github.com/RanduRetana/SASHecg---PUBLIC"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
              , so anyone, including your IT team, can check exactly what it does.
            </p>
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
