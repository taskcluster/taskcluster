#!/bin/bash

cd "$(dirname "${0}")"
aws_region=us-west-2

curl -L 'https://github.com/mozilla-releng/OpenCloudConfig/tree/master/userdata/Manifest' 2>/dev/null | sed -n 's/.*\(gecko[^.]*\)\.json.*/\1/p' | sort -u | while read tc_worker_type
do
  case "${tc_worker_type}" in
    gecko-t-win7-32-gpu*)
      aws_base_ami_search_term=${aws_base_ami_search_term:='gecko-t-win7-32-base-20170905'}
      aws_instance_type=${aws_instance_type:='g2.2xlarge'}
      aws_base_ami_id="$(aws ec2 describe-images --region ${aws_region} --owners self --filters "Name=state,Values=available" "Name=name,Values=${aws_base_ami_search_term}" --query 'Images[*].{A:CreationDate,B:ImageId}' --output text | sort -u | tail -1 | cut -f2)"
      ami_description="Gecko test worker for Windows 7 32 bit; TaskCluster worker type: ${tc_worker_type}, OCC version ${aws_client_token}, https://github.com/mozilla-releng/OpenCloudConfig/tree/${GITHUB_HEAD_SHA}"}
      gw_tasks_dir='Z:\'
      root_username=root
      worker_username=GenericWorker
      aws_copy_regions=('us-east-1' 'us-east-2' 'us-west-1' 'eu-central-1')
      block_device_mappings='[{"DeviceName":"/dev/sda1","Ebs":{"VolumeType":"gp2","VolumeSize":30,"DeleteOnTermination":true}},{"DeviceName":"/dev/sdb","Ebs":{"VolumeType":"gp2","VolumeSize":120,"DeleteOnTermination":true}},{"DeviceName":"/dev/sdc","Ebs":{"VolumeType":"gp2","VolumeSize":120,"DeleteOnTermination":true}}]'
      ;;
    gecko-t-win7-32*)
      aws_base_ami_search_term=${aws_base_ami_search_term:='gecko-t-win7-32-base-20170905'}
      aws_instance_type=${aws_instance_type:='c4.2xlarge'}
      aws_base_ami_id="$(aws ec2 describe-images --region ${aws_region} --owners self --filters "Name=state,Values=available" "Name=name,Values=${aws_base_ami_search_term}" --query 'Images[*].{A:CreationDate,B:ImageId}' --output text | sort -u | tail -1 | cut -f2)"
      ami_description="Gecko test worker for Windows 7 32 bit; TaskCluster worker type: ${tc_worker_type}, OCC version ${aws_client_token}, https://github.com/mozilla-releng/OpenCloudConfig/tree/${GITHUB_HEAD_SHA}"}
      gw_tasks_dir='Z:\'
      root_username=root
      worker_username=GenericWorker
      aws_copy_regions=('us-east-1' 'us-east-2' 'us-west-1' 'eu-central-1')
      block_device_mappings='[{"DeviceName":"/dev/sda1","Ebs":{"VolumeType":"gp2","VolumeSize":30,"DeleteOnTermination":true}},{"DeviceName":"/dev/sdb","Ebs":{"VolumeType":"gp2","VolumeSize":120,"DeleteOnTermination":true}},{"DeviceName":"/dev/sdc","Ebs":{"VolumeType":"gp2","VolumeSize":120,"DeleteOnTermination":true}}]'
      ;;
    gecko-t-win10-64-gpu*)
      aws_base_ami_search_term=${aws_base_ami_search_term:='gecko-t-win10-64-gpu-base-20170921'}
      aws_instance_type=${aws_instance_type:='g2.2xlarge'}
      aws_base_ami_id="$(aws ec2 describe-images --region ${aws_region} --owners self --filters "Name=state,Values=available" "Name=name,Values=${aws_base_ami_search_term}" --query 'Images[*].{A:CreationDate,B:ImageId}' --output text | sort -u | tail -1 | cut -f2)"
      ami_description="Gecko tester for Windows 10 64 bit; TaskCluster worker type: ${tc_worker_type}, OCC version ${aws_client_token}, https://github.com/mozilla-releng/OpenCloudConfig/tree/${GITHUB_HEAD_SHA}"}
      gw_tasks_dir='Z:\'
      root_username=Administrator
      worker_username=GenericWorker
      aws_copy_regions=('us-east-1' 'us-east-2' 'eu-central-1')
      block_device_mappings='[{"DeviceName":"/dev/sda1","Ebs":{"VolumeType":"gp2","VolumeSize":120,"DeleteOnTermination":true}},{"DeviceName":"/dev/sdb","Ebs":{"VolumeType":"gp2","VolumeSize":120,"DeleteOnTermination":true}}]'
      ;;
    gecko-t-win10-64*)
      aws_base_ami_search_term=${aws_base_ami_search_term:='gecko-t-win10-64-base-20170905'}
      aws_instance_type=${aws_instance_type:='c4.2xlarge'}
      aws_base_ami_id="$(aws ec2 describe-images --region ${aws_region} --owners self --filters "Name=state,Values=available" "Name=name,Values=${aws_base_ami_search_term}" --query 'Images[*].{A:CreationDate,B:ImageId}' --output text | sort -u | tail -1 | cut -f2)"
      ami_description="Gecko tester for Windows 10 64 bit; TaskCluster worker type: ${tc_worker_type}, OCC version ${aws_client_token}, https://github.com/mozilla-releng/OpenCloudConfig/tree/${GITHUB_HEAD_SHA}"}
      gw_tasks_dir='Z:\'
      root_username=Administrator
      worker_username=GenericWorker
      aws_copy_regions=('us-east-1' 'us-east-2' 'us-west-1' 'eu-central-1')
      block_device_mappings='[{"DeviceName":"/dev/sda1","Ebs":{"VolumeType":"gp2","VolumeSize":120,"DeleteOnTermination":true}},{"DeviceName":"/dev/sdb","Ebs":{"VolumeType":"gp2","VolumeSize":120,"DeleteOnTermination":true}}]'
      ;;
    gecko-[123]-b-win2012*)
      aws_base_ami_search_term=${aws_base_ami_search_term:='gecko-b-win2012-base-*'}
      aws_instance_type=${aws_instance_type:='c4.4xlarge'}
      aws_base_ami_id="$(aws ec2 describe-images --region ${aws_region} --owners self --filters "Name=state,Values=available" "Name=name,Values=${aws_base_ami_search_term}" --query 'Images[*].{A:CreationDate,B:ImageId}' --output text | sort -u | tail -1 | cut -f2)"
      ami_description="Gecko builder for Windows; TaskCluster worker type: ${tc_worker_type}, OCC version ${aws_client_token}, https://github.com/mozilla-releng/OpenCloudConfig/tree/${GITHUB_HEAD_SHA}"}
      gw_tasks_dir='Z:\'
      root_username=Administrator
      worker_username=GenericWorker
      aws_copy_regions=('us-east-1' 'us-west-1' 'eu-central-1')
      block_device_mappings='[{"DeviceName":"/dev/sda1","Ebs":{"VolumeType":"gp2","VolumeSize":40,"DeleteOnTermination":true}},{"DeviceName":"/dev/sdb","Ebs":{"VolumeType":"gp2","VolumeSize":120,"DeleteOnTermination":true}}]'
      ;;
    *)
      echo "ERROR: unknown worker type: '${tc_worker_type}'"
      exit 67
      ;;
  esac
  echo "${aws_base_ami_search_term}" > "${tc_worker_type}/ami-base-name"
done
