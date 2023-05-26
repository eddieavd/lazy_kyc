# lazy_kyc
BlinkID In-browser SDK demo app which performs multiside image acquisition and deferred data extraction from obtained document images.

# usage
To start the app, run
```bash
./bpm_serve
```
or serve the files manually via http.

# implementation
The app uses BlinkID In-browser SDK v6.1.0.  
Image acquisition is performed with the BlinkID multiside recognizer with ``recognitionModeFilter`` set to ``PhotoID`` to avoid any data extraction.  
Once obtained, the front side document image is passed to the single side recognizer for data extraction.

# use-case motivation
The multiside recognizer provides great UX for scanning two sides of a document in a single camera session.  
Certain use-cases require only an image of the back side which can be achieved with the PhotoID recognition mode.
However, the multiside recognizer doesn't allow changes to its settings in the middle of a scan.  
To preserve the smooth scanning UX of the multiside recognizer, we can use it to perform image acquisition only
and extract data from the front side afterwards.
