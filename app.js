/*
 *
 *
 *      BlinkID In-browser SDK demo
 *
 *      performs multiside scan to obtain document images
 *      and subsequently runs data extraction on front side image
 *
 */


const initial_msg_el = document.getElementById(           "msg" );
const progress_el    = document.getElementById( "load-progress" );

const cam_feed      = document.getElementById(     "camera-feed" );
const cam_feedback  = document.getElementById( "camera-feedback" );
const scan_feedback = document.getElementById(   "camera-guides" );
const draw_context  = cam_feedback.getContext(              "2d" );

function main ()
{
        if( !BlinkIDSDK.isBrowserSupported() )
        {
                initial_msg_el.innerText = "This browser is not supported!";
                return;
        }

        // localhost license key copied from https://github.com/BlinkID/blinkid-in-browser/blob/653de9c5914c54aa21bdc054344cd33fd9419adf/examples/multi-side/javascript/app.js#L37

        let license_key = "sRwAAAYJbG9jYWxob3N0r/lOPk4/w35CpJnWLjM8ZY9al1B+dHT1pvkVLDlPi2TrNIleC/ZCr2/SCnbqKTEiEgN7pWFr0Qk/PJQyjnslTbSSENvp1un8OJTDhtTlz33EWHz3HMhHcBcmNHGVcshRgrlnCwb0j/5Z3DBqGHzAJl+lDRItIEO2F0f+U9YOrp6mJXKRHF2o6nMmSxdyK8E1bw8W3k4FN1mppgXE7fIc/W9OV+YpsjzUba91QVd1Zfd2qJ6OCj9B4eUQTE90EN5ICYZ6HdjxIdgn/+swmIPdmJGHpyKj0Nmv9K1Rz4llL5rTFffJ0kx3l/DklE+S5GUGmQ+GWOuLx6M5eNE=";

        const load_settings = new BlinkIDSDK.WasmSDKLoadSettings( license_key );

        load_settings.loadProgressCallback = ( progress ) => progress_el.value = progress;
        load_settings.engineLocation       = window.location.origin + "/resources";

        BlinkIDSDK.loadWasmModule( load_settings ).then(
                ( sdk ) =>
                {
                        document.getElementById( "screen-initial" ).classList.add   ( "hidden" );
                        document.getElementById(   "screen-start" ).classList.remove( "hidden" );
                        document.getElementById(     "start-scan" ).addEventListener( "click", ( ev ) =>
                                {
                                        ev.preventDefault();
                                        start_scan( sdk );
                                }
                        );
                },
                ( err ) =>
                {
                        initial_msg_el.innerText = "Failed to load SDK!";
                        console.error( "Failed to load SDK!", error );
                }
        );
}

async function start_scan ( sdk )
{
        document.getElementById(    "screen-start" ).classList.add   ( "hidden" );
        document.getElementById( "screen-scanning" ).classList.remove( "hidden" );

        const multi_rec  = await BlinkIDSDK.createBlinkIdMultiSideRecognizer ( sdk );
        const single_rec = await BlinkIDSDK.createBlinkIdSingleSideRecognizer( sdk );

        const multi_rec_settings = await multi_rec.currentSettings();

        const mode_filter = new BlinkIDSDK.RecognitionModeFilter();

        // explicit for clarity
        // this setup prevents multiside recognizer from performing data extraction
        // only image acquisition is performed

        mode_filter.enableMrzId                   = false;
        mode_filter.enableMrzPassport             = false;
        mode_filter.enableMrzVisa                 = false;
        mode_filter.enablePhotoId                 =  true;
        mode_filter.enableBarcodeId               = false;
        mode_filter.enableFullDocumentRecognition = false;

        multi_rec_settings[ "returnEncodedFullDocumentImage" ] =        true;
        multi_rec_settings[        "returnFullDocumentImage" ] =        true;
        multi_rec_settings[          "recognitionModeFilter" ] = mode_filter;

        await multi_rec.updateSettings( multi_rec_settings );

        const callbacks = {
                onQuadDetection   : ( quad ) => draw_quad( quad ),
                onDetectionFailed : (      ) => update_scan_feedback( "Detection failed", true ),
                onFirstSideResult : (      ) => alert( "Flip the document" )
        };
        let runner = await BlinkIDSDK.createRecognizerRunner(
                sdk           ,
                [ multi_rec ] ,
                false         ,
                callbacks
        );
        const video_recognizer = await BlinkIDSDK.VideoRecognizer.createVideoRecognizerFromCameraStream(
                cam_feed,
                runner
        );

        let imagedata;

        try
        {
                video_recognizer.startRecognition(
                        async ( rec_state ) =>
                        {
                                if( !video_recognizer )
                                {
                                        return;
                                }

                                // pause recognition before performing any async calls
                                video_recognizer.pauseRecognition();

                                if( rec_state === BlinkIDSDK.RecognizerResultState.Empty )
                                {
                                        console.log( "rec_state is empty" );
                                        return;
                                }
                                const result = await multi_rec.getResult();

                                if( result.state === BlinkIDSDK.RecognizerResultState.Empty )
                                {
                                        console.log( "result.state is empty" );
                                        return;
                                }
                                console.log( "multiside scan finished with results:", result );

                                imagedata = result.fullDocumentFrontImage.rawImage;

                                video_recognizer.releaseVideoFeed();
                                runner.delete();
                                multi_rec.delete();
                                clear_canvas();

                                document.getElementById( "screen-scanning" ).classList.add( "hidden" );
                                document.getElementById( "screen-start" ).classList.remove( "hidden" );

                                // document images acquired, let's extract data from the front

                                runner = await BlinkIDSDK.createRecognizerRunner(
                                        sdk            ,
                                        [ single_rec ] ,
                                        false          ,
                                        callbacks
                                );
                                const start = Date.now();

                                let extraction_results;

                                try
                                {
                                        const image = imagedata_to_image( imagedata );
                                        await image.decode();

                                        const image_frame       = BlinkIDSDK.captureFrame( image );
                                        const processing_result = await runner.processImage( image_frame );

                                        if( processing_result !== BlinkIDSDK.RecognizerResultState.Empty )
                                        {
                                                extraction_results = await single_rec.getResult();

                                                const delta = Date.now() - start;

                                                console.log( "extraction results:", extraction_results );
                                                console.log( "spent additional", delta, "ms for extraction" );
                                        }
                                        else
                                        {
                                                alert( "Could not extract information!" );
                                        }
                                }
                                catch( err )
                                {
                                        console.error( "Error scanning front side image!", err );
                                        return;
                                }
                                runner.delete();
                                single_rec.delete();
                                clear_canvas();

                                const first_name = extraction_results.firstName.latin;
                                const last_name  = extraction_results.lastName.latin ;

                                alert( first_name + " " + last_name );
                        }
                );
        }
        catch( err )
        {
                console.error( "Error initializing video recognizer", err );
                return;
        }
}

function imagedata_to_image ( imagedata )
{
        var tmp_canvas = document.createElement( "canvas" );
        var ctx        = tmp_canvas.getContext (     "2d" );

        tmp_canvas.width  = imagedata.width ;
        tmp_canvas.height = imagedata.height;

        ctx.putImageData( imagedata, 0, 0 );

        let image = new Image();
        image.src = tmp_canvas.toDataURL();
        return image;
}

function draw_quad ( quad )
{
        clear_canvas();

        setup_color( quad );
        setup_msg  ( quad );

        apply_transform( quad.transformMatrix );

        draw_context.beginPath();
        draw_context.moveTo(     quad.topLeft.x,     quad.topLeft.y );
        draw_context.lineTo(    quad.topRight.x,    quad.topRight.y );
        draw_context.lineTo( quad.bottomRight.x, quad.bottomRight.y );
        draw_context.lineTo(  quad.bottomLeft.x,  quad.bottomLeft.y );
        draw_context.closePath();
        draw_context.stroke();
}

function apply_transform ( transform_matrix )
{
        const canvas_AR =  cam_feedback.width /  cam_feedback.height;
        const  video_AR = cam_feed.videoWidth / cam_feed.videoHeight;

        let x_off          = 0;
        let y_off          = 0;
        let scaled_video_h = 0;
        let scaled_video_w = 0;

        if( canvas_AR > video_AR )
        {
                scaled_video_h = cam_feedback.height;
                scaled_video_w = video_AR * scaled_video_h;
                x_off = ( cam_feedback.width - scaled_video_w ) / 2.0;
        }
        else
        {
                scaled_video_w = cam_feedback.width;
                scaled_video_h = scaled_video_w / video_AR;
                y_off = ( cam_feedback.height - scaled_video_h ) / 2.0;
        }
        draw_context.translate( x_off, y_off );

        draw_context.scale(
                scaled_video_w / cam_feed.videoWidth,
                scaled_video_h / cam_feed.videoHeight
        );
        draw_context.transform(
                transform_matrix[ 0 ],
                transform_matrix[ 3 ],
                transform_matrix[ 1 ],
                transform_matrix[ 4 ],
                transform_matrix[ 2 ],
                transform_matrix[ 5 ]
        );
}

function clear_canvas ()
{
        cam_feedback.width  = cam_feedback.clientWidth ;
        cam_feedback.height = cam_feedback.clientHeight;

        draw_context.clearRect(
                0,
                0,
                cam_feedback.width,
                cam_feedback.height
        );
}

function setup_color ( displayable )
{
        let color = "#FFFF00FF";

        if( displayable.detectionStatus === 0 )
        {
                color = "#FF0000FF";
        }
        else if( displayable.detectionStatus === 1 )
        {
                color = "#00FF00FF";
        }
        else
        {
                console.log( "unknown detection status", displayable );
        }

        draw_context.fillStyle   = color;
        draw_context.strokeStyle = color;
        draw_context.lineWidth   =     5;
}

function setup_msg ( displayable )
{
        switch( displayable.detectionStatus )
        {

                case BlinkIDSDK.DetectionStatus.Fail:
                        update_scan_feedback( "Scanning..." );
                        break;
                case BlinkIDSDK.DetectionStatus.Success:
                case BlinkIDSDK.DetectionStatus.FallbackSuccess:
                        update_scan_feedback( "Detection successful" );
                        break;
                case BlinkIDSDK.DetectionStatus.CameraAtAngle:
                        update_scan_feedback( "Adjust the angle" );
                        break;
                case BlinkIDSDK.DetectionStatus.CameraTooHigh:
                        update_scan_feedback( "Move document closer" );
                        break;
                case BlinkIDSDK.DetectionStatus.CameraTooNear:
                case BlinkIDSDK.DetectionStatus.DocumentTooCloseToEdge:
                case BlinkIDSDK.DetectionStatus.Partial:
                        update_scan_feedback( "Move document farther" );
                        break;
                default:
                        console.warn( "Unhandled detection status!", displayable.detectionStatus );
        }
}

let scan_feedback_lock = false;

function update_scan_feedback ( message, force )
{
        if( scan_feedback_lock && !force )
        {
                return;
        }
        scan_feedback_lock      =    true;
        scan_feedback.innerText = message;

        window.setTimeout(() => scan_feedback_lock = false, 1000);
}

main();
