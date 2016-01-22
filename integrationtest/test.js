    x = "";
    y = "123";
    var z = "{fvvvv}";
    var cmd = [
        '--client-id=' + x,
        '--access-token=' + y,
    ];
    if (z && z.length > 0) { 
        cmd = cmd.concat('--certificate=' + z)
    }   
    cmd = cmd.concat([
        "fdfd",
        "xcxc"
		]
    );  
    console.log(cmd);
